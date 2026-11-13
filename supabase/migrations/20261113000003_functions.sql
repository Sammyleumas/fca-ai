-- MindFlow server-side functions

-- Materials: students may rename / organise / mark opened, but processing fields are
-- owned by the processing pipeline.
revoke update on public.materials from authenticated;
grant update (title, subject_id, folder_id, last_opened_at) on public.materials to authenticated;

-- ---------------------------------------------------------------------------
-- New user bootstrap: profile, streak row, free subscription.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'preferred_name',
                                      new.raw_user_meta_data ->> 'full_name',
                                      new.raw_user_meta_data ->> 'name', '')), '');
begin
  insert into public.profiles (id, preferred_name, full_name, avatar_url)
  values (
    new.id,
    left(v_name, 60),
    left(nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''), 120),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.study_streaks (user_id) values (new.id) on conflict do nothing;
  insert into public.subscriptions (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Local date helper (user's time zone; falls back to UTC on invalid zones).
-- ---------------------------------------------------------------------------
create or replace function public.user_local_date(p_user_id uuid, p_at timestamptz default now())
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
begin
  select timezone into v_tz from public.profiles where id = p_user_id;
  begin
    return (p_at at time zone coalesce(v_tz, 'UTC'))::date;
  exception when others then
    return (p_at at time zone 'UTC')::date;
  end;
end;
$$;
revoke execute on function public.user_local_date(uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Activity ledger + streak + XP + achievements.
--
-- Streak rule: a day counts only when the student completes a meaningful learning
-- activity: an assigned study task, a study session or an assessment. Each such
-- activity must reference a real, completed row owned by the caller and may be
-- recorded only once. Opening the app or reading alone never extends a streak.
-- XP is capped per day to avoid rewarding unhealthy marathon sessions.
-- ---------------------------------------------------------------------------
create unique index study_activity_once_per_reference
  on public.study_activity (user_id, kind, reference_id)
  where reference_id is not null and kind in ('task_completed', 'session_completed', 'quiz_completed', 'material_uploaded');

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
revoke execute on function public.record_study_activity(public.activity_kind, integer, uuid, uuid) from public, anon;
grant execute on function public.record_study_activity(public.activity_kind, integer, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Fixed-window rate limiting. Keys are namespaced by the caller's id so a client
-- cannot exhaust another user's bucket. Returns true when the call is allowed.
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := coalesce(auth.uid()::text, 'service') || ':' || left(p_key, 100);
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit parameters' using errcode = '22023';
  end if;
  insert into public.rate_limit_buckets as b (key, window_start, count)
  values (v_key, v_window, 1)
  on conflict (key, window_start) do update set count = b.count + 1
  returning count into v_count;

  -- Opportunistic cleanup of stale windows.
  if random() < 0.01 then
    delete from public.rate_limit_buckets where window_start < now() - interval '1 day';
  end if;
  return v_count <= p_limit;
end;
$$;
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.check_rate_limit(text, integer, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Quiz review: answers & explanations become visible only after submission.
-- ---------------------------------------------------------------------------
create or replace function public.get_attempt_review(p_attempt_id uuid)
returns table (
  question_id uuid, question_position integer, question_type public.question_type, prompt text, options jsonb,
  correct_answer jsonb, explanation text, topic text, source_material_id uuid, source_page integer,
  answer jsonb, is_correct boolean, points numeric, points_awarded numeric, feedback text
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.position, q.type, q.prompt, q.options, q.correct_answer, q.explanation, q.topic,
         q.source_material_id, q.source_page, a.answer, a.is_correct, q.points, a.points_awarded, a.feedback
  from public.quiz_attempts t
  join public.quiz_questions q on q.quiz_id = t.quiz_id and q.user_id = t.user_id
  left join public.quiz_answers a on a.attempt_id = t.id and a.question_id = q.id
  where t.id = p_attempt_id
    and t.user_id = auth.uid()
    and t.status in ('submitted', 'graded')
  order by q.position;
$$;
revoke execute on function public.get_attempt_review(uuid) from public, anon;
grant execute on function public.get_attempt_review(uuid) to authenticated;
