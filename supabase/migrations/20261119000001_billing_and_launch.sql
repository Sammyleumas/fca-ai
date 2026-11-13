-- Phase 7: billing (Paystack + Stripe), email delivery, launch hardening.

alter table public.subscriptions
  add column currency text check (currency ~ '^[A-Z]{3}$'),
  add column billing_interval text check (billing_interval in ('month', 'year')),
  add column amount_minor integer check (amount_minor >= 0),
  add column provider_plan_code text,
  add column provider_email_token text,
  add column last_event_at timestamptz;

-- Students can read their subscription, but never the provider's management token.
revoke select on public.subscriptions from authenticated;
grant select (id, user_id, plan, status, provider, current_period_end, cancel_at_period_end, currency,
              billing_interval, amount_minor, created_at, updated_at)
  on public.subscriptions to authenticated;

-- Webhook ledger: every provider event is processed at most once.
create table public.billing_events (
  id bigint generated always as identity primary key,
  provider public.billing_provider not null,
  event_id text not null check (char_length(event_id) between 1 and 200),
  event_type text not null,
  user_id uuid references auth.users (id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  unique (provider, event_id)
);
alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;

-- Email delivery bookkeeping for reminders.
alter table public.notifications add column emailed_at timestamptz;
create index notifications_email_queue_idx on public.notifications (created_at) where emailed_at is null;

-- Webhooks sometimes identify a customer only by email (e.g. Paystack's
-- subscription.create). Service role only.
create or replace function public.user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke execute on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;
