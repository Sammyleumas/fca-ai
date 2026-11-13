-- Phase 6: engagement — analytics, reminders, weekly goals, milestones.

-- ---------------------------------------------------------------------------
-- Weekly goals (student-editable).
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column weekly_goal_minutes integer not null default 300 check (weekly_goal_minutes between 30 and 5040),
  add column weekly_goal_days smallint not null default 5 check (weekly_goal_days between 1 and 7);
grant update (weekly_goal_minutes, weekly_goal_days) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Notification de-duplication: each reminder fires once per key.
-- ---------------------------------------------------------------------------
alter table public.notifications add column dedupe_key text check (char_length(dedupe_key) <= 120);
create unique index notifications_dedupe_idx on public.notifications (user_id, dedupe_key) where dedupe_key is not null;

-- ---------------------------------------------------------------------------
-- Milestones: two new achievement criteria (study time, flashcard reviews).
-- ---------------------------------------------------------------------------
create or replace function public.record_study_activity(
  p_kind public.activity_kind,
  p_minutes integer default 0,
  p_material_id uuid default null,
  p_reference_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date;
  v_minutes integer := greatest(0, least(coalesce(p_minutes, 0), 240));
  v_qualifies boolean := p_kind in ('task_completed', 'session_completed', 'quiz_completed');
  v_xp integer;
  v_xp_today integer;
  v_daily_cap constant integer := 300;
  v_streak public.study_streaks%rowtype;
  v_new_achievements jsonb := '[]'::jsonb;
  v_ach record;
  v_valid boolean := true;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Qualifying activities must point at real, completed work owned by the caller.
  if p_kind = 'task_completed' then
    select exists (select 1 from public.study_tasks
                   where id = p_reference_id and user_id = v_uid and status = 'completed') into v_valid;
  elsif p_kind = 'session_completed' then
    select exists (select 1 from public.study_sessions
                   where id = p_reference_id and user_id = v_uid and status = 'completed') into v_valid;
  elsif p_kind = 'quiz_completed' then
    select exists (select 1 from public.quiz_attempts
                   where id = p_reference_id and user_id = v_uid and status in ('submitted', 'graded')) into v_valid;
  elsif p_kind = 'material_uploaded' then
    select exists (select 1 from public.materials
                   where id = p_reference_id and user_id = v_uid) into v_valid;
  end if;
  if not v_valid then
    raise exception 'activity reference is not a completed item owned by the caller' using errcode = '22023';
  end if;

  if p_material_id is not null and not exists (
    select 1 from public.materials where id = p_material_id and user_id = v_uid
  ) then
    raise exception 'material not found' using errcode = '22023';
  end if;

  v_today := public.user_local_date(v_uid);

  v_xp := case p_kind
    when 'reading' then least(v_minutes / 5, 12)
    when 'task_completed' then 20
    when 'session_completed' then 50
    when 'quiz_completed' then 30
    when 'flashcard_review' then 2
    when 'material_uploaded' then 10
    else 0
  end;

  select coalesce(sum(xp_awarded), 0) into v_xp_today
  from public.study_activity where user_id = v_uid and activity_date = v_today;
  v_xp := greatest(0, least(v_xp, v_daily_cap - v_xp_today));

  begin
    insert into public.study_activity (user_id, kind, activity_date, minutes, material_id, reference_id,
                                       qualifies_for_streak, xp_awarded)
    values (v_uid, p_kind, v_today, v_minutes, p_material_id, p_reference_id, v_qualifies, v_xp);
  exception when unique_violation then
    -- Already recorded: idempotent no-op.
    select * into v_streak from public.study_streaks where user_id = v_uid;
    return jsonb_build_object('recorded', false, 'xp_awarded', 0,
                              'current_streak', coalesce(v_streak.current_streak, 0),
                              'new_achievements', '[]'::jsonb);
  end;

  insert into public.study_streaks (user_id) values (v_uid) on conflict do nothing;
  select * into v_streak from public.study_streaks where user_id = v_uid for update;

  if v_qualifies and (v_streak.last_qualifying_date is distinct from v_today) then
    if v_streak.last_qualifying_date = v_today - 1 then
      v_streak.current_streak := v_streak.current_streak + 1;
    else
      v_streak.current_streak := 1;
    end if;
    v_streak.longest_streak := greatest(v_streak.longest_streak, v_streak.current_streak);
    v_streak.last_qualifying_date := v_today;
    update public.study_streaks
       set current_streak = v_streak.current_streak,
           longest_streak = v_streak.longest_streak,
           last_qualifying_date = v_streak.last_qualifying_date,
           updated_at = now()
     where user_id = v_uid;
  end if;

  -- Achievements
  for v_ach in
    select a.* from public.achievements a
    where not exists (select 1 from public.user_achievements ua
                      where ua.user_id = v_uid and ua.achievement_id = a.id)
  loop
    if (case v_ach.criteria ->> 'type'
          when 'qualifying_activities' then
            (select count(*) from public.study_activity
              where user_id = v_uid and qualifies_for_streak) >= (v_ach.criteria ->> 'count')::int
          when 'streak' then v_streak.current_streak >= (v_ach.criteria ->> 'days')::int
          when 'quizzes_completed' then
            (select count(*) from public.study_activity
              where user_id = v_uid and kind = 'quiz_completed') >= (v_ach.criteria ->> 'count')::int
          when 'high_quiz_scores' then
            (select count(*) from public.quiz_attempts
              where user_id = v_uid and percent >= (v_ach.criteria ->> 'min_percent')::numeric)
              >= (v_ach.criteria ->> 'count')::int
          when 'reading_minutes' then
            (select coalesce(sum(minutes), 0) from public.study_activity
              where user_id = v_uid and kind = 'reading') >= (v_ach.criteria ->> 'minutes')::int
          when 'sessions_completed' then
            (select count(*) from public.study_activity
              where user_id = v_uid and kind = 'session_completed') >= (v_ach.criteria ->> 'count')::int
          when 'materials_uploaded' then
            (select count(*) from public.materials where user_id = v_uid) >= (v_ach.criteria ->> 'count')::int
          when 'plan_completed' then
            exists (select 1 from public.study_plans where user_id = v_uid and status = 'completed')
          when 'study_minutes' then
            (select coalesce(sum(minutes), 0) from public.study_activity where user_id = v_uid) >= (v_ach.criteria ->> 'minutes')::int
          when 'flashcard_reviews' then
            (select count(*) from public.flashcard_reviews where user_id = v_uid) >= (v_ach.criteria ->> 'count')::int
          else false
        end) then
      insert into public.user_achievements (user_id, achievement_id) values (v_uid, v_ach.id)
      on conflict do nothing;
      update public.profiles set xp = xp + v_ach.xp where id = v_uid;
      insert into public.notifications (user_id, kind, title, body, link)
      values (v_uid, 'achievement', 'Achievement unlocked: ' || v_ach.name, v_ach.description, '/achievements');
      v_new_achievements := v_new_achievements || jsonb_build_object('code', v_ach.code, 'name', v_ach.name, 'xp', v_ach.xp);
    end if;
  end loop;

  if v_xp > 0 then
    update public.profiles set xp = xp + v_xp where id = v_uid;
  end if;

  return jsonb_build_object(
    'recorded', true,
    'xp_awarded', v_xp,
    'qualifies_for_streak', v_qualifies,
    'current_streak', v_streak.current_streak,
    'longest_streak', v_streak.longest_streak,
    'new_achievements', v_new_achievements
  );
end;
$$;

insert into public.achievements (code, name, description, icon, xp, criteria, sort_order) values
  ('ten_hour_scholar', 'Ten-Hour Scholar', 'Study for ten hours in total.', 'graduation-cap', 150, '{"type": "study_minutes", "minutes": 600}', 75),
  ('fifty_hour_scholar', 'Fifty-Hour Scholar', 'Study for fifty hours in total.', 'trophy', 400, '{"type": "study_minutes", "minutes": 3000}', 95),
  ('card_shark', 'Card Shark', 'Complete 100 flashcard reviews.', 'check-circle', 100, '{"type": "flashcard_reviews", "count": 100}', 85)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Reminders. Generated per student in their own time zone, honouring their
-- notification preferences, at most once per key. Reminders never fire late at
-- night, and streak nudges are gentle (evening only).
-- ---------------------------------------------------------------------------
create or replace function public.generate_user_notifications(p_user_id uuid, p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_tz text;
  v_local timestamp;
  v_today date;
  v_hour integer;
  v_prefs jsonb;
  v_streak public.study_streaks%rowtype;
  v_count integer := 0;
  v_n integer;
  v_minutes integer;
  v_rec record;
  v_week_start date;
  v_prev_month date;
begin
  select * into v_profile from public.profiles where id = p_user_id;
  if not found or v_profile.onboarding_completed_at is null then return 0; end if;
  v_tz := v_profile.timezone;
  begin
    v_local := p_now at time zone v_tz;
  exception when others then
    v_local := p_now at time zone 'UTC';
  end;
  v_today := v_local::date;
  v_hour := extract(hour from v_local)::int;
  v_prefs := v_profile.notification_prefs;
  if v_hour >= 22 or v_hour < 7 then return 0; end if; -- quiet hours

  -- Upcoming sessions today (morning).
  if coalesce((v_prefs ->> 'sessions')::boolean, true) and v_hour < 12 then
    select count(*), coalesce(sum(s.planned_minutes), 0) into v_n, v_minutes
    from public.study_sessions s join public.study_plans p on p.id = s.plan_id
    where s.user_id = p_user_id and p.status = 'active' and s.scheduled_date = v_today
      and s.kind in ('study', 'revision') and s.status in ('scheduled', 'in_progress');
    if v_n > 0 then
      insert into public.notifications (user_id, kind, title, body, link, dedupe_key, scheduled_for)
      values (p_user_id, 'upcoming_session', 'Today''s study plan',
              format('%s session%s planned today (about %s min).', v_n, case when v_n = 1 then '' else 's' end, v_minutes),
              '/planner', 'today:' || v_today, p_now)
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics v_n = row_count; v_count := v_count + v_n;
    end if;
  end if;

  -- Unfinished tasks from missed sessions (once a day per plan).
  if coalesce((v_prefs ->> 'sessions')::boolean, true) and v_hour >= 9 then
    for v_rec in
      select p.id, p.title, count(*) as missed
      from public.study_sessions s join public.study_plans p on p.id = s.plan_id
      where s.user_id = p_user_id and p.status = 'active' and s.scheduled_date < v_today
        and s.kind <> 'assessment' and s.status in ('scheduled', 'in_progress')
      group by p.id, p.title
    loop
      insert into public.notifications (user_id, kind, title, body, link, dedupe_key, scheduled_for)
      values (p_user_id, 'unfinished_task', 'Unfinished study tasks',
              format('%s session%s in “%s” were missed. MindFlow can rearrange them for you.', v_rec.missed,
                     case when v_rec.missed = 1 then '' else 's' end, left(v_rec.title, 80)),
              '/planner/' || v_rec.id, 'missed:' || v_rec.id || ':' || v_today, p_now)
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics v_n = row_count; v_count := v_count + v_n;
    end loop;
  end if;

  -- Daily study reminder at the student's chosen time, only if nothing counted today yet.
  if coalesce((v_prefs ->> 'daily_reminder')::boolean, true)
     and v_local::time >= coalesce(nullif(v_prefs ->> 'reminder_time', '')::time, '18:00')
     and not exists (select 1 from public.study_activity a
                     where a.user_id = p_user_id and a.activity_date = v_today and a.qualifies_for_streak) then
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key, scheduled_for)
    values (p_user_id, 'study_reminder', 'Time to study',
            'A short, focused session today keeps you moving. Even 15 minutes counts.', '/dashboard', 'daily:' || v_today, p_now)
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics v_n = row_count; v_count := v_count + v_n;
  end if;

  -- Daily quiz waiting (late afternoon / evening).
  if coalesce((v_prefs ->> 'quizzes')::boolean, true) and v_hour >= 17 then
    select s.id into v_rec from public.study_sessions s join public.study_plans p on p.id = s.plan_id
    where s.user_id = p_user_id and p.status = 'active' and s.scheduled_date = v_today and s.kind = 'assessment'
      and s.status in ('scheduled', 'in_progress')
    limit 1;
    if found then
      insert into public.notifications (user_id, kind, title, body, link, dedupe_key, scheduled_for)
      values (p_user_id, 'quiz_reminder', 'Your daily quiz is waiting',
              'A few questions on today''s topics help them stick.', '/planner/sessions/' || v_rec.id, 'quiz:' || v_today, p_now)
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics v_n = row_count; v_count := v_count + v_n;
    end if;
  end if;

  -- Gentle streak nudge (evening), only for a live streak not yet extended today.
  if coalesce((v_prefs ->> 'streaks')::boolean, true) and v_hour between 18 and 21 then
    select * into v_streak from public.study_streaks where user_id = p_user_id;
    if found and v_streak.current_streak >= 2 and v_streak.last_qualifying_date = v_today - 1 then
      insert into public.notifications (user_id, kind, title, body, link, dedupe_key, scheduled_for)
      values (p_user_id, 'streak', format('Keep your %s-day streak going', v_streak.current_streak),
              'Complete one study task or quiz today — a short session is enough.', '/dashboard', 'streak:' || v_today, p_now)
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics v_n = row_count; v_count := v_count + v_n;
    end if;
  end if;

  -- Weekly goal reached (celebration, once per week).
  if coalesce((v_prefs ->> 'achievements')::boolean, true) then
    v_week_start := v_today - ((extract(isodow from v_today)::int) - 1);
    select coalesce(sum(minutes), 0), count(distinct activity_date) filter (where minutes > 0 or qualifies_for_streak)
      into v_minutes, v_n
    from public.study_activity where user_id = p_user_id and activity_date between v_week_start and v_today;
    if v_minutes >= v_profile.weekly_goal_minutes and v_n >= v_profile.weekly_goal_days then
      insert into public.notifications (user_id, kind, title, body, link, dedupe_key, scheduled_for)
      values (p_user_id, 'achievement', 'Weekly goal reached',
              format('%s minutes over %s days this week. Remember to rest too.', v_minutes, v_n), '/analytics',
              'goal:' || v_week_start, p_now)
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics v_n = row_count; v_count := v_count + v_n;
    end if;
  end if;

  -- Monthly report (first days of the month, if there was activity last month).
  if extract(day from v_today) <= 3 then
    v_prev_month := (date_trunc('month', v_today) - interval '1 month')::date;
    if exists (select 1 from public.study_activity where user_id = p_user_id
               and activity_date >= v_prev_month and activity_date < date_trunc('month', v_today)::date) then
      insert into public.notifications (user_id, kind, title, body, link, dedupe_key, scheduled_for)
      values (p_user_id, 'system', format('Your %s report is ready', to_char(v_prev_month, 'FMMonth')),
              'See your study time, consistency, quiz results and what to focus on next.',
              '/analytics/report?month=' || to_char(v_prev_month, 'YYYY-MM'), 'report:' || to_char(v_prev_month, 'YYYY-MM'), p_now)
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
      get diagnostics v_n = row_count; v_count := v_count + v_n;
    end if;
  end if;

  return v_count;
end;
$$;
revoke execute on function public.generate_user_notifications(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.generate_user_notifications(uuid, timestamptz) to service_role;

-- Students refresh their own reminders (called when they open the app).
create or replace function public.refresh_my_notifications()
returns integer
language sql
security definer
set search_path = ''
as $$
  select public.generate_user_notifications(auth.uid(), now()) where auth.uid() is not null;
$$;
revoke execute on function public.refresh_my_notifications() from public, anon;
grant execute on function public.refresh_my_notifications() to authenticated;

-- Background job: everyone with recent activity or an active plan.
create or replace function public.generate_all_notifications(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_user uuid;
begin
  for v_user in
    select p.id from public.profiles p
    where p.onboarding_completed_at is not null
      and (exists (select 1 from public.study_plans sp where sp.user_id = p.id and sp.status = 'active')
           or exists (select 1 from public.study_activity a where a.user_id = p.id and a.created_at > p_now - interval '45 days'))
  loop
    v_total := v_total + public.generate_user_notifications(v_user, p_now);
  end loop;
  return v_total;
end;
$$;
revoke execute on function public.generate_all_notifications(timestamptz) from public, anon, authenticated;
grant execute on function public.generate_all_notifications(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Analytics: everything derived from stored activity (RLS applies: invoker).
-- ---------------------------------------------------------------------------
create or replace function public.analytics_summary(p_days integer default 30)
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
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 366);
  v_from date;
  v_prev_from date;
  v_week_start date;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select timezone into v_tz from public.profiles where id = v_uid;
  begin
    v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date;
  exception when others then
    v_today := (now() at time zone 'UTC')::date;
  end;
  v_from := v_today - (v_days - 1);
  v_prev_from := v_from - v_days;
  v_week_start := v_today - ((extract(isodow from v_today)::int) - 1);

  with act as (
    select * from public.study_activity where user_id = v_uid and activity_date between v_prev_from and v_today
  ),
  attempts as (
    select t.id, t.percent, t.submitted_at, t.feedback, q.title, q.kind, q.material_id,
           ((t.submitted_at at time zone coalesce(v_tz, 'UTC'))::date) as local_date
    from public.quiz_attempts t join public.quizzes q on q.id = t.quiz_id
    where t.user_id = v_uid and t.status = 'graded' and t.percent is not null
  )
  select jsonb_build_object(
    'today', v_today,
    'from', v_from,
    'days', v_days,
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'date', d::date,
        'minutes', coalesce((select sum(minutes) from act where activity_date = d::date), 0),
        'tasks', (select count(*) from act where activity_date = d::date and kind = 'task_completed'),
        'quizzes', (select count(*) from act where activity_date = d::date and kind = 'quiz_completed'),
        'qualified', exists (select 1 from act where activity_date = d::date and qualifies_for_streak)
      ) order by d)
      from generate_series(v_from, v_today, interval '1 day') d
    ),
    'totals', jsonb_build_object(
      'minutes', (select coalesce(sum(minutes), 0) from act where activity_date >= v_from),
      'prev_minutes', (select coalesce(sum(minutes), 0) from act where activity_date < v_from),
      'reading_minutes', (select coalesce(sum(minutes), 0) from act where activity_date >= v_from and kind = 'reading'),
      'active_days', (select count(distinct activity_date) from act where activity_date >= v_from and (minutes > 0 or qualifies_for_streak)),
      'tasks_completed', (select count(*) from act where activity_date >= v_from and kind = 'task_completed'),
      'sessions_completed', (select count(*) from act where activity_date >= v_from and kind = 'session_completed'),
      'quizzes_completed', (select count(*) from attempts where local_date >= v_from),
      'flashcard_reviews', (select count(*) from act where activity_date >= v_from and kind = 'flashcard_review'),
      'avg_quiz', (select round(avg(percent), 1) from attempts where local_date >= v_from),
      'prev_avg_quiz', (select round(avg(percent), 1) from attempts where local_date >= v_prev_from and local_date < v_from),
      'materials_completed', (select count(*) from public.reading_progress where user_id = v_uid and percent_complete >= 100),
      'materials_total', (select count(*) from public.materials where user_id = v_uid and status = 'ready'),
      'overall_progress', (select coalesce(round(avg(coalesce(rp.percent_complete, 0)), 1), 0)
                           from public.materials m left join public.reading_progress rp on rp.material_id = m.id
                           where m.user_id = v_uid and m.status = 'ready'),
      'all_time_minutes', (select coalesce(sum(minutes), 0) from public.study_activity where user_id = v_uid)
    ),
    'quiz_trend', coalesce((
      select jsonb_agg(jsonb_build_object('date', local_date, 'percent', percent, 'title', title, 'kind', kind) order by submitted_at)
      from attempts where local_date >= v_from
    ), '[]'::jsonb),
    'topics', coalesce((
      select jsonb_agg(x order by (x ->> 'percent')::numeric)
      from (
        select jsonb_build_object(
          'topic', t ->> 'topic',
          'section_id', max(t ->> 'sectionId'),
          'score', sum((t ->> 'score')::numeric),
          'max', sum((t ->> 'max')::numeric),
          'attempts', count(*),
          'percent', round(100 * sum((t ->> 'score')::numeric) / nullif(sum((t ->> 'max')::numeric), 0))
        ) as x
        from attempts a, jsonb_array_elements(coalesce(a.feedback -> 'topics', '[]'::jsonb)) t
        where a.local_date >= v_from and (t ->> 'max')::numeric > 0
        group by t ->> 'topic'
      ) s
    ), '[]'::jsonb),
    'materials', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'title', m.title, 'subject', sub.name,
        'minutes', (select coalesce(sum(minutes), 0) from act where activity_date >= v_from and material_id = m.id),
        'reading_percent', coalesce(rp.percent_complete, 0),
        'quiz_avg', (select round(avg(percent), 1) from attempts where material_id = m.id and local_date >= v_from),
        'quiz_count', (select count(*) from attempts where material_id = m.id and local_date >= v_from)
      ) order by m.title)
      from public.materials m
      left join public.subjects sub on sub.id = m.subject_id
      left join public.reading_progress rp on rp.material_id = m.id
      where m.user_id = v_uid and m.status = 'ready'
    ), '[]'::jsonb),
    'heatmap', (
      select jsonb_agg(jsonb_build_object('date', d::date,
        'minutes', coalesce((select sum(minutes) from public.study_activity where user_id = v_uid and activity_date = d::date), 0)) order by d)
      from generate_series(v_today - 83, v_today, interval '1 day') d
    ),
    'week', jsonb_build_object(
      'start', v_week_start,
      'minutes', (select coalesce(sum(minutes), 0) from act where activity_date >= v_week_start),
      'active_days', (select count(distinct activity_date) from act where activity_date >= v_week_start and (minutes > 0 or qualifies_for_streak)),
      'quizzes', (select count(*) from act where activity_date >= v_week_start and kind = 'quiz_completed'),
      'flashcard_reviews', (select count(*) from act where activity_date >= v_week_start and kind = 'flashcard_review'),
      'tasks', (select count(*) from act where activity_date >= v_week_start and kind = 'task_completed'),
      'goal_minutes', (select weekly_goal_minutes from public.profiles where id = v_uid),
      'goal_days', (select weekly_goal_days from public.profiles where id = v_uid)
    ),
    'streak', (select jsonb_build_object('current', current_streak, 'longest', longest_streak, 'last', last_qualifying_date)
               from public.study_streaks where user_id = v_uid)
  ) into v_result;
  return v_result;
end;
$$;
revoke execute on function public.analytics_summary(integer) from public, anon;
grant execute on function public.analytics_summary(integer) to authenticated;

-- Monthly report window.
create or replace function public.analytics_month(p_month date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_from date := date_trunc('month', p_month)::date;
  v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_tz text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select timezone into v_tz from public.profiles where id = v_uid;
  return jsonb_build_object(
    'from', v_from, 'to', v_to,
    'minutes', (select coalesce(sum(minutes), 0) from public.study_activity where user_id = v_uid and activity_date between v_from and v_to),
    'active_days', (select count(distinct activity_date) from public.study_activity where user_id = v_uid and activity_date between v_from and v_to and (minutes > 0 or qualifies_for_streak)),
    'tasks_completed', (select count(*) from public.study_activity where user_id = v_uid and activity_date between v_from and v_to and kind = 'task_completed'),
    'sessions_completed', (select count(*) from public.study_activity where user_id = v_uid and activity_date between v_from and v_to and kind = 'session_completed'),
    'flashcard_reviews', (select count(*) from public.study_activity where user_id = v_uid and activity_date between v_from and v_to and kind = 'flashcard_review'),
    'xp', (select coalesce(sum(xp_awarded), 0) from public.study_activity where user_id = v_uid and activity_date between v_from and v_to),
    'quizzes', (select count(*) from public.quiz_attempts where user_id = v_uid and status = 'graded'
                and (submitted_at at time zone coalesce(v_tz, 'UTC'))::date between v_from and v_to),
    'avg_quiz', (select round(avg(percent), 1) from public.quiz_attempts where user_id = v_uid and status = 'graded'
                 and (submitted_at at time zone coalesce(v_tz, 'UTC'))::date between v_from and v_to),
    'achievements', coalesce((select jsonb_agg(a.name order by ua.earned_at) from public.user_achievements ua
                              join public.achievements a on a.id = ua.achievement_id
                              where ua.user_id = v_uid and (ua.earned_at at time zone coalesce(v_tz, 'UTC'))::date between v_from and v_to), '[]'::jsonb),
    'daily', (select jsonb_agg(jsonb_build_object('date', d::date,
              'minutes', coalesce((select sum(minutes) from public.study_activity where user_id = v_uid and activity_date = d::date), 0)) order by d)
              from generate_series(v_from, v_to, interval '1 day') d)
  );
end;
$$;
revoke execute on function public.analytics_month(date) from public, anon;
grant execute on function public.analytics_month(date) to authenticated;
