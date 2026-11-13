-- Phase 3: AI analysis, study planning and material-grounded retrieval.

-- ---------------------------------------------------------------------------
-- Retrieval: full-text search over extracted pages (RLS applies: invoker).
-- ---------------------------------------------------------------------------
alter table public.material_pages
  add column search tsvector generated always as (to_tsvector('english', coalesce(content, ''))) stored;
create index material_pages_search_idx on public.material_pages using gin (search);

create or replace function public.search_material_pages(
  p_material_ids uuid[],
  p_query text,
  p_limit integer default 6
)
returns table (material_id uuid, page_number integer, content text, rank real)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (select websearch_to_tsquery('english', left(p_query, 500)) as t)
  select p.material_id, p.page_number, p.content, ts_rank_cd(p.search, q.t) as rank
  from public.material_pages p, q
  where p.material_id = any (p_material_ids)
    and numnode(q.t) > 0
    and p.search @@ q.t
  order by rank desc, p.page_number
  limit least(greatest(p_limit, 1), 20);
$$;
revoke execute on function public.search_material_pages(uuid[], text, integer) from public, anon;
grant execute on function public.search_material_pages(uuid[], text, integer) to authenticated, service_role;

-- Where a section came from (bookmarks, headings, typography or AI analysis).
alter table public.document_sections
  add column source text not null default 'structure' check (source in ('structure', 'ai'));

-- ---------------------------------------------------------------------------
-- Plans: created and rescheduled atomically (SECURITY INVOKER -> RLS applies,
-- composite FKs guarantee every referenced row belongs to the caller).
-- ---------------------------------------------------------------------------
create or replace function public.create_study_plan(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plan uuid := gen_random_uuid();
  v_session jsonb;
  v_session_id uuid;
  v_task jsonb;
  v_i integer := 0;
  v_j integer;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;

  insert into public.study_plans (id, user_id, title, mode, status, start_date, deadline, daily_minutes, study_days,
                                  preferred_time, workload, generation_meta)
  values (v_plan, v_uid, p ->> 'title', (p ->> 'mode')::public.plan_mode, 'active', (p ->> 'start_date')::date,
          (p ->> 'deadline')::date, (p ->> 'daily_minutes')::int,
          array(select jsonb_array_elements_text(p -> 'study_days')::smallint),
          p ->> 'preferred_time', coalesce((p ->> 'workload')::public.workload_preference, 'balanced'),
          coalesce(p -> 'meta', '{}'::jsonb));

  insert into public.study_plan_materials (plan_id, material_id, user_id, position)
  select v_plan, m.value::uuid, v_uid, m.ordinality - 1
  from jsonb_array_elements_text(p -> 'material_ids') with ordinality as m(value, ordinality);

  for v_session in select * from jsonb_array_elements(p -> 'sessions') loop
    v_session_id := gen_random_uuid();
    insert into public.study_sessions (id, plan_id, user_id, scheduled_date, starts_at, planned_minutes, kind, title, objectives)
    values (v_session_id, v_plan, v_uid, (v_session ->> 'date')::date, (v_session ->> 'starts_at')::timestamptz,
            (v_session ->> 'minutes')::int, (v_session ->> 'kind')::public.session_kind, v_session ->> 'title',
            array(select jsonb_array_elements_text(coalesce(v_session -> 'objectives', '[]'::jsonb))));
    v_j := 0;
    for v_task in select * from jsonb_array_elements(coalesce(v_session -> 'tasks', '[]'::jsonb)) loop
      insert into public.study_tasks (session_id, plan_id, user_id, material_id, section_id, position, title,
                                      start_page, end_page, estimated_minutes)
      values (v_session_id, v_plan, v_uid, (v_task ->> 'material_id')::uuid, (v_task ->> 'section_id')::uuid, v_j,
              v_task ->> 'title', (v_task ->> 'start_page')::int, (v_task ->> 'end_page')::int,
              coalesce((v_task ->> 'minutes')::int, 0));
      v_j := v_j + 1;
    end loop;
    v_i := v_i + 1;
  end loop;

  if v_i = 0 then raise exception 'a plan needs at least one session' using errcode = '22023'; end if;
  return v_plan;
end;
$$;
revoke execute on function public.create_study_plan(jsonb) from public, anon;
grant execute on function public.create_study_plan(jsonb) to authenticated;

-- Applies an approved reschedule: unfinished sessions are marked missed/rescheduled,
-- new sessions are created and their (existing) tasks are moved into them.
-- Completed work is never touched.
create or replace function public.apply_plan_reschedule(p_plan_id uuid, p jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_session jsonb;
  v_new uuid;
  v_task_id text;
  v_pos integer;
  v_count integer := 0;
  v_moved integer;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.study_plans where id = p_plan_id and user_id = v_uid and status = 'active') then
    raise exception 'plan not found' using errcode = '22023';
  end if;

  -- Old open sessions: past ones become "missed", future ones "rescheduled".
  update public.study_sessions
     set status = case when scheduled_date < (p ->> 'today')::date then 'missed'::public.session_status
                       else 'rescheduled'::public.session_status end
   where plan_id = p_plan_id and user_id = v_uid and status in ('scheduled', 'in_progress')
     and id in (select (jsonb_array_elements_text(p -> 'replace_session_ids'))::uuid);

  for v_session in select * from jsonb_array_elements(p -> 'sessions') loop
    v_new := gen_random_uuid();
    insert into public.study_sessions (id, plan_id, user_id, scheduled_date, starts_at, planned_minutes, kind, title,
                                       objectives, rescheduled_from)
    values (v_new, p_plan_id, v_uid, (v_session ->> 'date')::date, (v_session ->> 'starts_at')::timestamptz,
            (v_session ->> 'minutes')::int, (v_session ->> 'kind')::public.session_kind, v_session ->> 'title',
            array(select jsonb_array_elements_text(coalesce(v_session -> 'objectives', '[]'::jsonb))),
            (v_session ->> 'rescheduled_from')::uuid);
    v_pos := 0;
    for v_task_id in select jsonb_array_elements_text(coalesce(v_session -> 'task_ids', '[]'::jsonb)) loop
      update public.study_tasks
         set session_id = v_new, position = v_pos
       where id = v_task_id::uuid and plan_id = p_plan_id and user_id = v_uid and status <> 'completed';
      get diagnostics v_moved = row_count;
      if v_moved = 0 then raise exception 'task % cannot be moved', v_task_id using errcode = '22023'; end if;
      v_pos := v_pos + 1;
    end loop;
    v_count := v_count + 1;
  end loop;

  update public.study_plans
     set version = version + 1,
         deadline = greatest(deadline, coalesce((p ->> 'deadline')::date, deadline))
   where id = p_plan_id;

  return v_count;
end;
$$;
revoke execute on function public.apply_plan_reschedule(uuid, jsonb) from public, anon;
grant execute on function public.apply_plan_reschedule(uuid, jsonb) to authenticated;
