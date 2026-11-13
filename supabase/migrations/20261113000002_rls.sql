-- MindFlow Row Level Security
--
-- Access classes:
--   owner_crud      : the owner may select / insert / update / delete their own rows.
--   owner_read      : the owner may only read; writes happen through trusted server
--                     code (service role) or SECURITY DEFINER functions. Used for data
--                     that must not be fabricated by the client (AI output, quiz
--                     results, streaks, XP, subscriptions, processing output).
--   owner_read_write_no_insert : notifications — owner can read, mark read, delete.
-- anon has no access to application tables at all.

-- Enable RLS everywhere (also on tables nobody but the service role may touch).
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','subjects','folders','materials','material_pages','document_processing_jobs',
    'document_sections','study_plans','study_plan_materials','study_sessions','study_tasks',
    'reading_progress','bookmarks','highlights','notes','ai_conversations','ai_messages',
    'quizzes','quiz_questions','quiz_attempts','quiz_answers','flashcards','flashcard_reviews',
    'study_streaks','achievements','user_achievements','study_activity','notifications',
    'subscriptions','ai_usage_events','rate_limit_buckets'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- owner_crud tables -----------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'subjects','folders','materials','study_plans','study_plan_materials','study_sessions',
    'study_tasks','reading_progress','bookmarks','highlights','notes','ai_conversations',
    'flashcards'
  ] loop
    execute format($f$create policy "%1$s_select_own" on public.%1$I for select to authenticated
      using (user_id = (select auth.uid()))$f$, t);
    execute format($f$create policy "%1$s_insert_own" on public.%1$I for insert to authenticated
      with check (user_id = (select auth.uid()))$f$, t);
    execute format($f$create policy "%1$s_update_own" on public.%1$I for update to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$f$, t);
    execute format($f$create policy "%1$s_delete_own" on public.%1$I for delete to authenticated
      using (user_id = (select auth.uid()))$f$, t);
  end loop;
end $$;

-- owner_read tables ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'material_pages','document_processing_jobs','document_sections','ai_messages','quizzes',
    'quiz_questions','quiz_attempts','quiz_answers','study_streaks','user_achievements',
    'study_activity','subscriptions','ai_usage_events','flashcard_reviews'
  ] loop
    execute format($f$create policy "%1$s_select_own" on public.%1$I for select to authenticated
      using (user_id = (select auth.uid()))$f$, t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
  end loop;
end $$;

-- The student writes their own question to a conversation; assistant replies are
-- written by the server after the model responds.
grant insert on public.ai_messages to authenticated;
create policy "ai_messages_insert_own_user_role" on public.ai_messages for insert to authenticated
  with check (user_id = (select auth.uid()) and role = 'user');

-- Flashcard reviews are a log written by the student while revising.
grant insert on public.flashcard_reviews to authenticated;
create policy "flashcard_reviews_insert_own" on public.flashcard_reviews for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Quiz questions: correct answers & explanations are hidden at column level until
-- an attempt is submitted (exposed through public.get_attempt_review()).
revoke select on public.quiz_questions from authenticated;
grant select (id, quiz_id, user_id, position, type, prompt, options, topic, section_id,
              source_material_id, source_page, points, created_at)
  on public.quiz_questions to authenticated;

-- profiles ---------------------------------------------------------------------
create policy "profiles_select_own" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Rows are created by the auth trigger; XP is only changed by record_study_activity().
revoke insert, delete, truncate on public.profiles from authenticated;
revoke update on public.profiles from authenticated;
grant update (preferred_name, full_name, avatar_url, education_level, learning_goals,
              daily_study_minutes, preferred_study_time, timezone, notification_prefs,
              reading_prefs, theme, onboarding_completed_at)
  on public.profiles to authenticated;

-- notifications -----------------------------------------------------------------
create policy "notifications_select_own" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notifications_update_own" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notifications_delete_own" on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));
revoke insert, truncate on public.notifications from authenticated;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- achievements catalogue: readable by any signed-in student -----------------------
create policy "achievements_read_all" on public.achievements for select to authenticated using (true);
revoke insert, update, delete, truncate on public.achievements from authenticated;

-- rate_limit_buckets: no policies -> only service role / definer functions.
revoke all on public.rate_limit_buckets from authenticated;
