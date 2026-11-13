-- Dashboard aggregates computed from stored activity (no demo data).
-- SECURITY INVOKER: runs with the caller's privileges, so RLS scopes every row.
create or replace function public.dashboard_stats()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tz text;
  v_today date;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select timezone into v_tz from public.profiles where id = v_uid;
  begin
    v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date;
  exception when others then
    v_today := (now() at time zone 'UTC')::date;
  end;

  select jsonb_build_object(
    'today', v_today,
    'materials_total', (select count(*) from public.materials where user_id = v_uid),
    'materials_ready', (select count(*) from public.materials where user_id = v_uid and status = 'ready'),
    'materials_processing', (select count(*) from public.materials
                              where user_id = v_uid and status not in ('ready', 'failed')),
    'overall_completion', coalesce((
        select round(avg(coalesce(rp.percent_complete, 0)), 1)
        from public.materials m
        left join public.reading_progress rp on rp.material_id = m.id and rp.user_id = v_uid
        where m.user_id = v_uid), 0),
    'avg_quiz_score', (select round(avg(percent), 1) from public.quiz_attempts
                        where user_id = v_uid and status in ('submitted', 'graded') and percent is not null),
    'quizzes_completed', (select count(*) from public.quiz_attempts
                           where user_id = v_uid and status in ('submitted', 'graded')),
    'total_study_minutes', (select coalesce(sum(minutes), 0) from public.study_activity where user_id = v_uid),
    'today_minutes', (select coalesce(sum(minutes), 0) from public.study_activity
                       where user_id = v_uid and activity_date = v_today),
    'tasks_today_total', (select count(*) from public.study_tasks t
                           join public.study_sessions s on s.id = t.session_id
                           where t.user_id = v_uid and s.scheduled_date = v_today),
    'tasks_today_done', (select count(*) from public.study_tasks t
                          join public.study_sessions s on s.id = t.session_id
                          where t.user_id = v_uid and s.scheduled_date = v_today and t.status = 'completed'),
    'week', (
      select jsonb_agg(jsonb_build_object(
               'date', d::date,
               'minutes', coalesce(a.minutes, 0),
               'qualified', coalesce(a.qualified, false)) order by d)
      from generate_series(v_today - 6, v_today, interval '1 day') as d
      left join (
        select activity_date, sum(minutes) as minutes, bool_or(qualifies_for_streak) as qualified
        from public.study_activity
        where user_id = v_uid and activity_date between v_today - 6 and v_today
        group by activity_date
      ) a on a.activity_date = d::date
    ),
    'streak', (select jsonb_build_object('current_streak', current_streak, 'longest_streak', longest_streak,
                                         'last_qualifying_date', last_qualifying_date)
               from public.study_streaks where user_id = v_uid),
    'xp', (select xp from public.profiles where id = v_uid)
  ) into v_result;

  return v_result;
end;
$$;
revoke execute on function public.dashboard_stats() from public, anon;
grant execute on function public.dashboard_stats() to authenticated;
