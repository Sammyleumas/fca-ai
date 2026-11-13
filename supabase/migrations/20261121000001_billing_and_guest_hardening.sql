-- Hardening after review: atomic, order-safe subscription updates; a fixed grace
-- period for failed renewals; guest clean-up based on real session activity.

-- 1. Failed renewals keep Premium only for a short grace period (not a whole unpaid period).
alter table public.subscriptions add column grace_until timestamptz;
grant select (grace_until) on public.subscriptions to authenticated;

-- 2. Apply a verified provider event atomically. Row-locks the subscription, ignores
--    events older than the last one applied for the same provider, and keeps any
--    field the event doesn't carry (null = unchanged). Returns true if applied.
create or replace function public.apply_subscription_update(
  p_user_id uuid,
  p_provider public.billing_provider,
  p_event_at timestamptz,
  p_plan public.subscription_plan default null,
  p_status public.subscription_status default null,
  p_customer_id text default null,
  p_subscription_id text default null,
  p_period_end timestamptz default null,
  p_cancel_at_period_end boolean default null,
  p_currency text default null,
  p_interval text default null,
  p_amount_minor integer default null,
  p_plan_code text default null,
  p_email_token text default null,
  p_grace_days integer default 7
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cur public.subscriptions%rowtype;
begin
  insert into public.subscriptions (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select * into v_cur from public.subscriptions where user_id = p_user_id for update;

  if v_cur.last_event_at is not null and v_cur.provider = p_provider and v_cur.last_event_at > p_event_at then
    return false;
  end if;

  update public.subscriptions set
    provider = p_provider,
    last_event_at = p_event_at,
    plan = coalesce(p_plan, plan),
    status = coalesce(p_status, status),
    provider_customer_id = coalesce(p_customer_id, provider_customer_id),
    provider_subscription_id = coalesce(p_subscription_id, provider_subscription_id),
    current_period_end = coalesce(p_period_end, current_period_end),
    cancel_at_period_end = coalesce(p_cancel_at_period_end, cancel_at_period_end),
    currency = coalesce(upper(p_currency), currency),
    billing_interval = coalesce(p_interval, billing_interval),
    amount_minor = coalesce(p_amount_minor, amount_minor),
    provider_plan_code = coalesce(p_plan_code, provider_plan_code),
    provider_email_token = coalesce(p_email_token, provider_email_token),
    grace_until = case
      when p_status = 'past_due' and v_cur.status is distinct from 'past_due' then now() + make_interval(days => greatest(p_grace_days, 0))
      when p_status is not null and p_status <> 'past_due' then null
      else grace_until
    end
  where user_id = p_user_id;
  return true;
end;
$$;
revoke execute on function public.apply_subscription_update(uuid, public.billing_provider, timestamptz, public.subscription_plan, public.subscription_status, text, text, timestamptz, boolean, text, text, integer, text, text, integer) from public, anon, authenticated;
grant execute on function public.apply_subscription_update(uuid, public.billing_provider, timestamptz, public.subscription_plan, public.subscription_status, text, text, timestamptz, boolean, text, text, integer, text, text, integer) to service_role;

-- 3. A guest is "unused" only if no session has been refreshed recently either
--    (last_sign_in_at doesn't change when tokens refresh).
create or replace function public.stale_guest_ids(p_days integer default 30, p_limit integer default 100)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where u.is_anonymous
    and greatest(
          u.created_at,
          u.last_sign_in_at,
          (select max(greatest(s.updated_at, s.refreshed_at::timestamptz, s.created_at)) from auth.sessions s where s.user_id = u.id)
        ) < now() - make_interval(days => greatest(p_days, 1))
  order by u.created_at
  limit least(greatest(p_limit, 1), 500);
$$;
revoke execute on function public.stale_guest_ids(integer, integer) from public, anon, authenticated;
grant execute on function public.stale_guest_ids(integer, integer) to service_role;
