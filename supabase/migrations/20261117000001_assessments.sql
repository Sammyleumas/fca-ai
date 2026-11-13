-- Phase 5: assessments & flashcards.

alter table public.quizzes
  add column source_material_ids uuid[] not null default '{}',
  add column config jsonb not null default '{}'::jsonb;

-- One live daily quiz per assessment session (retries reuse it; failed ones can be regenerated).
create unique index quizzes_one_daily_per_session
  on public.quizzes (session_id)
  where kind = 'daily' and session_id is not null and status <> 'failed';

alter table public.quiz_questions
  add column difficulty smallint check (difficulty between 1 and 5);

alter table public.quiz_attempts
  add column graded_at timestamptz,
  add column ungraded_count integer not null default 0;

create index if not exists quiz_attempts_quiz_user_idx on public.quiz_attempts (quiz_id, user_id, created_at desc);
create index if not exists flashcards_material_idx on public.flashcards (user_id, material_id);
create unique index if not exists flashcards_one_per_mistake
  on public.flashcards (user_id, source_question_id) where source_question_id is not null;

-- Review data now also exposes difficulty and the question id for flashcard links.
drop function if exists public.get_attempt_review(uuid);
create or replace function public.get_attempt_review(p_attempt_id uuid)
returns table (
  question_id uuid, question_position integer, question_type public.question_type, prompt text, options jsonb,
  correct_answer jsonb, explanation text, topic text, section_id uuid, source_material_id uuid, source_page integer,
  answer jsonb, is_correct boolean, points numeric, points_awarded numeric, feedback text
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.position, q.type, q.prompt, q.options, q.correct_answer, q.explanation, q.topic, q.section_id,
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

-- Flashcard review: one call updates the schedule and logs the review atomically.
create or replace function public.review_flashcard(
  p_flashcard_id uuid,
  p_rating public.flashcard_rating,
  p_ease numeric,
  p_interval_days integer,
  p_repetitions integer,
  p_due_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_prev integer;
begin
  select interval_days into v_prev from public.flashcards where id = p_flashcard_id and user_id = v_uid for update;
  if not found then raise exception 'flashcard not found' using errcode = '22023'; end if;
  update public.flashcards
     set ease_factor = least(3.0, greatest(1.3, p_ease)),
         interval_days = greatest(0, least(p_interval_days, 3650)),
         repetitions = greatest(0, p_repetitions),
         due_at = least(greatest(p_due_at, now()), now() + interval '3650 days')
   where id = p_flashcard_id;
  insert into public.flashcard_reviews (flashcard_id, user_id, rating, previous_interval_days, new_interval_days, ease_factor)
  values (p_flashcard_id, v_uid, p_rating, v_prev, greatest(0, least(p_interval_days, 3650)), least(3.0, greatest(1.3, p_ease)));
end;
$$;
revoke execute on function public.review_flashcard(uuid, public.flashcard_rating, numeric, integer, integer, timestamptz) from public, anon;
grant execute on function public.review_flashcard(uuid, public.flashcard_rating, numeric, integer, integer, timestamptz) to authenticated;
