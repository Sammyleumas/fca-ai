-- FCA-AI core schema
-- Schema version 1. Every user-owned table carries user_id and is protected by RLS
-- (see 20261113000002_rls.sql). Child tables use composite foreign keys
-- (parent_id, user_id) -> parent(id, user_id) so rows can never be attached to
-- another user's data.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.education_level as enum (
  'secondary', 'undergraduate', 'postgraduate', 'professional', 'exam_candidate', 'independent', 'other'
);
create type public.subject_kind as enum ('subject', 'course', 'examination');
create type public.folder_kind as enum ('folder', 'collection');
create type public.material_file_type as enum ('pdf', 'docx', 'txt');
create type public.material_status as enum (
  'uploaded', 'queued', 'extracting', 'analysing', 'structuring', 'ready', 'failed'
);
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type public.plan_mode as enum ('individual', 'combined');
create type public.plan_status as enum ('draft', 'active', 'completed', 'archived');
create type public.workload_preference as enum ('light', 'balanced', 'intensive');
create type public.session_kind as enum ('study', 'revision', 'assessment');
create type public.session_status as enum ('scheduled', 'in_progress', 'completed', 'missed', 'rescheduled');
create type public.task_status as enum ('pending', 'in_progress', 'completed', 'skipped');
create type public.highlight_color as enum ('lime', 'yellow', 'green', 'blue', 'pink', 'orange');
create type public.conversation_mode as enum ('general', 'grounded');
create type public.message_role as enum ('user', 'assistant');
create type public.quiz_kind as enum ('daily', 'practice', 'mock');
create type public.quiz_status as enum ('generating', 'ready', 'failed');
create type public.question_type as enum ('mcq', 'true_false', 'fill_blank', 'short_answer', 'theory');
create type public.attempt_status as enum ('in_progress', 'submitted', 'graded');
create type public.flashcard_origin as enum ('material', 'section', 'definition', 'concept', 'quiz_mistake', 'manual');
create type public.flashcard_rating as enum ('difficult', 'practice', 'know');
create type public.activity_kind as enum (
  'reading', 'task_completed', 'session_completed', 'quiz_completed', 'flashcard_review', 'ai_question', 'material_uploaded'
);
create type public.notification_kind as enum (
  'study_reminder', 'upcoming_session', 'unfinished_task', 'quiz_reminder', 'streak', 'plan_changed', 'achievement', 'processing', 'system'
);
create type public.subscription_plan as enum ('free', 'premium');
create type public.subscription_status as enum ('active', 'trialing', 'past_due', 'cancelled', 'incomplete');
create type public.billing_provider as enum ('none', 'stripe', 'paystack');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  preferred_name text check (char_length(preferred_name) between 1 and 60),
  full_name text check (char_length(full_name) <= 120),
  avatar_url text,
  education_level public.education_level,
  learning_goals text[] not null default '{}',
  daily_study_minutes integer not null default 60 check (daily_study_minutes between 10 and 720),
  preferred_study_time text check (preferred_study_time in ('morning', 'afternoon', 'evening', 'night', 'flexible')),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  notification_prefs jsonb not null default
    '{"daily_reminder": true, "reminder_time": "18:00", "sessions": true, "quizzes": true, "streaks": true, "achievements": true, "plan_changes": true, "email": false}'::jsonb,
  reading_prefs jsonb not null default
    '{"font_size": 18, "line_height": 1.7, "theme": "dark", "focus_mode": false}'::jsonb,
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  xp integer not null default 0 check (xp >= 0),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. subjects
-- ---------------------------------------------------------------------------
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind public.subject_kind not null default 'subject',
  color text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  exam_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, kind, name)
);
create index subjects_user_idx on public.subjects (user_id);
create trigger subjects_updated_at before update on public.subjects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. folders
-- ---------------------------------------------------------------------------
create table public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid,
  subject_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  kind public.folder_kind not null default 'folder',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (parent_id, user_id) references public.folders (id, user_id) on delete cascade,
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id),
  check (parent_id is null or parent_id <> id)
);
create index folders_user_idx on public.folders (user_id);
create index folders_parent_idx on public.folders (parent_id);
create trigger folders_updated_at before update on public.folders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. materials
-- ---------------------------------------------------------------------------
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid,
  folder_id uuid,
  title text not null check (char_length(title) between 1 and 300),
  original_filename text not null check (char_length(original_filename) between 1 and 300),
  file_type public.material_file_type not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  storage_path text not null unique,
  checksum_sha256 text check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  page_count integer check (page_count >= 0),
  word_count integer check (word_count >= 0),
  status public.material_status not null default 'uploaded',
  status_detail text,
  processing_error text,
  processing_progress smallint not null default 0 check (processing_progress between 0 and 100),
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete set null (subject_id),
  foreign key (folder_id, user_id) references public.folders (id, user_id) on delete set null (folder_id)
);
create index materials_user_created_idx on public.materials (user_id, created_at desc);
create index materials_user_status_idx on public.materials (user_id, status);
create index materials_user_checksum_idx on public.materials (user_id, checksum_sha256);
create index materials_subject_idx on public.materials (subject_id);
create index materials_folder_idx on public.materials (folder_id);
create trigger materials_updated_at before update on public.materials
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. material_pages
-- ---------------------------------------------------------------------------
create table public.material_pages (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  content text not null default '',
  char_count integer generated always as (char_length(content)) stored,
  ocr_used boolean not null default false,
  created_at timestamptz not null default now(),
  unique (material_id, page_number),
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete cascade
);
create index material_pages_user_idx on public.material_pages (user_id);

-- ---------------------------------------------------------------------------
-- 6. document_processing_jobs
-- ---------------------------------------------------------------------------
create table public.document_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.job_status not null default 'queued',
  stage public.material_status not null default 'queued',
  progress smallint not null default 0 check (progress between 0 and 100),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  error text,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete cascade
);
create index processing_jobs_queue_idx on public.document_processing_jobs (status, run_after)
  where status in ('queued', 'running');
create index processing_jobs_material_idx on public.document_processing_jobs (material_id);
create index processing_jobs_user_idx on public.document_processing_jobs (user_id);
create trigger processing_jobs_updated_at before update on public.document_processing_jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. document_sections
-- ---------------------------------------------------------------------------
create table public.document_sections (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid,
  level smallint not null check (level between 1 and 3), -- 1 chapter, 2 subtopic, 3 learning unit
  position integer not null check (position >= 0),
  title text not null check (char_length(title) between 1 and 300),
  summary text,
  start_page integer not null check (start_page >= 1),
  end_page integer not null,
  estimated_minutes integer check (estimated_minutes >= 0),
  complexity smallint check (complexity between 1 and 5),
  learning_objectives text[] not null default '{}',
  key_concepts text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (id, user_id),
  check (end_page >= start_page),
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete cascade,
  foreign key (parent_id, user_id) references public.document_sections (id, user_id) on delete cascade
);
create index sections_material_idx on public.document_sections (material_id, level, position);
create index sections_parent_idx on public.document_sections (parent_id);
create index sections_user_idx on public.document_sections (user_id);

-- ---------------------------------------------------------------------------
-- 8. study_plans  /  9. study_plan_materials
-- ---------------------------------------------------------------------------
create table public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  mode public.plan_mode not null,
  status public.plan_status not null default 'draft',
  start_date date not null,
  deadline date not null,
  daily_minutes integer not null check (daily_minutes between 10 and 720),
  study_days smallint[] not null default '{1,2,3,4,5}' check (study_days <@ '{0,1,2,3,4,5,6}'::smallint[] and cardinality(study_days) >= 1),
  preferred_time text,
  workload public.workload_preference not null default 'balanced',
  version integer not null default 1,
  generation_meta jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (deadline >= start_date)
);
create index study_plans_user_idx on public.study_plans (user_id, status);
create trigger study_plans_updated_at before update on public.study_plans
  for each row execute function public.set_updated_at();

create table public.study_plan_materials (
  plan_id uuid not null,
  material_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (plan_id, material_id),
  foreign key (plan_id, user_id) references public.study_plans (id, user_id) on delete cascade,
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete cascade
);
create index plan_materials_material_idx on public.study_plan_materials (material_id);
create index plan_materials_user_idx on public.study_plan_materials (user_id);

-- ---------------------------------------------------------------------------
-- 10. study_sessions  /  11. study_tasks
-- ---------------------------------------------------------------------------
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  scheduled_date date not null,
  starts_at timestamptz,
  planned_minutes integer not null check (planned_minutes between 1 and 720),
  kind public.session_kind not null default 'study',
  status public.session_status not null default 'scheduled',
  title text not null,
  objectives text[] not null default '{}',
  rescheduled_from uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (plan_id, user_id) references public.study_plans (id, user_id) on delete cascade,
  foreign key (rescheduled_from, user_id) references public.study_sessions (id, user_id) on delete set null (rescheduled_from)
);
create index study_sessions_user_date_idx on public.study_sessions (user_id, scheduled_date);
create index study_sessions_plan_idx on public.study_sessions (plan_id, scheduled_date);
create trigger study_sessions_updated_at before update on public.study_sessions
  for each row execute function public.set_updated_at();

create table public.study_tasks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  plan_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  material_id uuid,
  section_id uuid,
  position integer not null default 0,
  title text not null,
  start_page integer check (start_page >= 1),
  end_page integer,
  estimated_minutes integer not null default 0 check (estimated_minutes >= 0),
  status public.task_status not null default 'pending',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (end_page is null or start_page is null or end_page >= start_page),
  foreign key (session_id, user_id) references public.study_sessions (id, user_id) on delete cascade,
  foreign key (plan_id, user_id) references public.study_plans (id, user_id) on delete cascade,
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete cascade,
  foreign key (section_id, user_id) references public.document_sections (id, user_id) on delete set null (section_id)
);
create index study_tasks_session_idx on public.study_tasks (session_id, position);
create index study_tasks_user_status_idx on public.study_tasks (user_id, status);
create index study_tasks_material_idx on public.study_tasks (material_id);
create trigger study_tasks_updated_at before update on public.study_tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 12. reading_progress / 13. bookmarks / 14. highlights / 15. notes
-- ---------------------------------------------------------------------------
create table public.reading_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  material_id uuid not null,
  current_page integer not null default 1 check (current_page >= 1),
  scroll_offset real not null default 0 check (scroll_offset between 0 and 1),
  pages_read integer[] not null default '{}',
  completed_section_ids uuid[] not null default '{}',
  percent_complete numeric(5, 2) not null default 0 check (percent_complete between 0 and 100),
  total_seconds integer not null default 0 check (total_seconds >= 0),
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, material_id),
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete cascade
);
create index reading_progress_last_read_idx on public.reading_progress (user_id, last_read_at desc);
create trigger reading_progress_updated_at before update on public.reading_progress
  for each row execute function public.set_updated_at();

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  material_id uuid not null,
  page_number integer not null check (page_number >= 1),
  label text check (char_length(label) <= 200),
  created_at timestamptz not null default now(),
  unique (user_id, material_id, page_number),
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete cascade
);

create table public.highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  material_id uuid not null,
  section_id uuid,
  page_number integer not null check (page_number >= 1),
  text text not null check (char_length(text) between 1 and 5000),
  color public.highlight_color not null default 'lime',
  anchor jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete cascade,
  foreign key (section_id, user_id) references public.document_sections (id, user_id) on delete set null (section_id)
);
create index highlights_material_idx on public.highlights (user_id, material_id, page_number);
create index highlights_text_search_idx on public.highlights using gin (to_tsvector('simple', text));
create trigger highlights_updated_at before update on public.highlights
  for each row execute function public.set_updated_at();

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  material_id uuid,
  section_id uuid,
  highlight_id uuid,
  page_number integer check (page_number >= 1),
  title text check (char_length(title) <= 200),
  body text not null check (char_length(body) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete cascade,
  foreign key (section_id, user_id) references public.document_sections (id, user_id) on delete set null (section_id),
  foreign key (highlight_id, user_id) references public.highlights (id, user_id) on delete set null (highlight_id)
);
create index notes_user_material_idx on public.notes (user_id, material_id, page_number);
create trigger notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 16. ai_conversations / 17. ai_messages
-- ---------------------------------------------------------------------------
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mode public.conversation_mode not null default 'general',
  material_id uuid,
  section_id uuid,
  title text not null default 'New conversation' check (char_length(title) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete set null (material_id),
  foreign key (section_id, user_id) references public.document_sections (id, user_id) on delete set null (section_id),
  check (mode = 'general' or material_id is not null or section_id is not null)
);
create index ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);
create trigger ai_conversations_updated_at before update on public.ai_conversations
  for each row execute function public.set_updated_at();

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.message_role not null,
  content text not null check (char_length(content) between 1 and 100000),
  citations jsonb not null default '[]'::jsonb,
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id) references public.ai_conversations (id, user_id) on delete cascade
);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- 18-21. quizzes, questions, attempts, answers
-- ---------------------------------------------------------------------------
create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid,
  plan_id uuid,
  material_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  kind public.quiz_kind not null default 'practice',
  status public.quiz_status not null default 'generating',
  source_section_ids uuid[] not null default '{}',
  time_limit_seconds integer check (time_limit_seconds between 30 and 14400),
  question_count integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (session_id, user_id) references public.study_sessions (id, user_id) on delete set null (session_id),
  foreign key (plan_id, user_id) references public.study_plans (id, user_id) on delete set null (plan_id),
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete set null (material_id)
);
create index quizzes_user_idx on public.quizzes (user_id, created_at desc);
create index quizzes_session_idx on public.quizzes (session_id);
create trigger quizzes_updated_at before update on public.quizzes
  for each row execute function public.set_updated_at();

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  position integer not null check (position >= 0),
  type public.question_type not null,
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answer jsonb not null,
  explanation text,
  topic text,
  section_id uuid,
  source_material_id uuid,
  source_page integer,
  points numeric(5, 2) not null default 1 check (points > 0),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (quiz_id, position),
  foreign key (quiz_id, user_id) references public.quizzes (id, user_id) on delete cascade,
  foreign key (section_id, user_id) references public.document_sections (id, user_id) on delete set null (section_id),
  foreign key (source_material_id, user_id) references public.materials (id, user_id) on delete set null (source_material_id)
);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score numeric(7, 2),
  max_score numeric(7, 2),
  percent numeric(5, 2) check (percent between 0 and 100),
  feedback jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (quiz_id, user_id) references public.quizzes (id, user_id) on delete cascade
);
create index quiz_attempts_user_idx on public.quiz_attempts (user_id, submitted_at desc);
create index quiz_attempts_quiz_idx on public.quiz_attempts (quiz_id);

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null,
  question_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  answer jsonb,
  is_correct boolean,
  points_awarded numeric(5, 2),
  feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id, question_id),
  foreign key (attempt_id, user_id) references public.quiz_attempts (id, user_id) on delete cascade,
  foreign key (question_id, user_id) references public.quiz_questions (id, user_id) on delete cascade
);
create trigger quiz_answers_updated_at before update on public.quiz_answers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 22. flashcards / 23. flashcard_reviews
-- ---------------------------------------------------------------------------
create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  material_id uuid,
  section_id uuid,
  source_question_id uuid,
  origin public.flashcard_origin not null default 'material',
  front text not null check (char_length(front) between 1 and 2000),
  back text not null check (char_length(back) between 1 and 4000),
  explanation text,
  source_page integer,
  ease_factor numeric(4, 2) not null default 2.5 check (ease_factor between 1.3 and 3.0),
  interval_days integer not null default 0 check (interval_days >= 0),
  repetitions integer not null default 0 check (repetitions >= 0),
  due_at timestamptz not null default now(),
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete cascade,
  foreign key (section_id, user_id) references public.document_sections (id, user_id) on delete set null (section_id),
  foreign key (source_question_id, user_id) references public.quiz_questions (id, user_id) on delete set null (source_question_id)
);
create index flashcards_due_idx on public.flashcards (user_id, due_at) where not suspended;
create trigger flashcards_updated_at before update on public.flashcards
  for each row execute function public.set_updated_at();

create table public.flashcard_reviews (
  id uuid primary key default gen_random_uuid(),
  flashcard_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating public.flashcard_rating not null,
  previous_interval_days integer not null,
  new_interval_days integer not null,
  ease_factor numeric(4, 2) not null,
  reviewed_at timestamptz not null default now(),
  foreign key (flashcard_id, user_id) references public.flashcards (id, user_id) on delete cascade
);
create index flashcard_reviews_user_idx on public.flashcard_reviews (user_id, reviewed_at desc);

-- ---------------------------------------------------------------------------
-- 24-27. streaks, achievements, activity
-- ---------------------------------------------------------------------------
create table public.study_streaks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_qualifying_date date,
  updated_at timestamptz not null default now()
);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  description text not null,
  icon text not null default 'trophy',
  xp integer not null default 0 check (xp >= 0),
  criteria jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.user_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id uuid not null references public.achievements (id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table public.study_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.activity_kind not null,
  activity_date date not null, -- local date in the user's time zone
  minutes integer not null default 0 check (minutes between 0 and 1440),
  material_id uuid,
  reference_id uuid,
  qualifies_for_streak boolean not null default false,
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  created_at timestamptz not null default now(),
  foreign key (material_id, user_id) references public.materials (id, user_id) on delete set null (material_id)
);
create index study_activity_user_date_idx on public.study_activity (user_id, activity_date desc);
create index study_activity_user_kind_idx on public.study_activity (user_id, kind);

-- ---------------------------------------------------------------------------
-- 28. notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.notification_kind not null,
  title text not null check (char_length(title) between 1 and 200),
  body text check (char_length(body) <= 2000),
  link text check (link is null or link ~ '^/'),
  scheduled_for timestamptz not null default now(),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, scheduled_for desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- 29. subscriptions
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  plan public.subscription_plan not null default 'free',
  status public.subscription_status not null default 'active',
  provider public.billing_provider not null default 'none',
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Supporting: AI usage metering & rate limiting
-- ---------------------------------------------------------------------------
create table public.ai_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_user_time_idx on public.ai_usage_events (user_id, created_at desc);
create index ai_usage_user_feature_idx on public.ai_usage_events (user_id, feature, created_at desc);

create table public.rate_limit_buckets (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
