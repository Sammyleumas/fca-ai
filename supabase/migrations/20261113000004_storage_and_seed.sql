-- Private storage for uploaded learning materials.
-- Object path convention: {user_id}/{material_id}/{sanitised_filename}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'materials', 'materials', false, 104857600, -- 100 MB hard ceiling; plan limits enforced server-side
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "materials_objects_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "materials_objects_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "materials_objects_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "materials_objects_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Achievement catalogue ----------------------------------------------------------
insert into public.achievements (code, name, description, icon, xp, criteria, sort_order) values
  ('first_study_session', 'First Study Session', 'Complete your first study task, session or assessment.', 'star', 50,
     '{"type": "qualifying_activities", "count": 1}', 10),
  ('first_upload', 'Library Builder', 'Upload your first learning material.', 'library', 20,
     '{"type": "materials_uploaded", "count": 1}', 20),
  ('streak_3', 'Warming Up', 'Study three days in a row.', 'flame', 50,
     '{"type": "streak", "days": 3}', 30),
  ('streak_7', 'Seven-Day Streak', 'Keep a seven-day study streak.', 'flame', 100,
     '{"type": "streak", "days": 7}', 40),
  ('consistent_learner', 'Consistent Learner', 'Keep a fourteen-day study streak.', 'calendar-check', 200,
     '{"type": "streak", "days": 14}', 50),
  ('quiz_master', 'Quiz Master', 'Score 85% or more on ten assessments.', 'trophy', 200,
     '{"type": "high_quiz_scores", "count": 10, "min_percent": 85}', 60),
  ('reading_champion', 'Reading Champion', 'Spend ten hours reading in the Reading Room.', 'book-open', 150,
     '{"type": "reading_minutes", "minutes": 600}', 70),
  ('session_finisher', 'Session Finisher', 'Complete twenty planned study sessions.', 'check-circle', 150,
     '{"type": "sessions_completed", "count": 20}', 80),
  ('examination_ready', 'Examination Ready', 'Complete an entire study plan.', 'graduation-cap', 300,
     '{"type": "plan_completed"}', 90)
on conflict (code) do update
  set name = excluded.name, description = excluded.description, icon = excluded.icon,
      xp = excluded.xp, criteria = excluded.criteria, sort_order = excluded.sort_order;
