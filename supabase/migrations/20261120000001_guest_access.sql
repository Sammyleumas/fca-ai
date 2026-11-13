-- Guest access ("Continue as guest") uses Supabase anonymous sign-ins: guests are
-- real auth.users rows with is_anonymous = true, protected by the same RLS as
-- everyone else. This adds housekeeping for abandoned guest sessions.

-- Guests who haven't been back for p_days (service role only; used by the cleanup job).
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
    and coalesce(u.last_sign_in_at, u.created_at) < now() - make_interval(days => greatest(p_days, 1))
  order by u.created_at
  limit least(greatest(p_limit, 1), 500);
$$;
revoke execute on function public.stale_guest_ids(integer, integer) from public, anon, authenticated;
grant execute on function public.stale_guest_ids(integer, integer) to service_role;
