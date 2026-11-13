-- Phase 2: document processing queue.

alter table public.materials
  add column pages_are_estimated boolean not null default false,
  add column processing_warning text,
  add column ocr_page_count integer not null default 0 check (ocr_page_count >= 0);

alter table public.document_processing_jobs
  add column state jsonb not null default '{}'::jsonb;

-- At most one active job per material.
create unique index processing_jobs_one_active_per_material
  on public.document_processing_jobs (material_id)
  where status in ('queued', 'running');

-- Atomically claims the next due job (or a running job whose lease expired) using
-- SKIP LOCKED, so concurrent workers never process the same job.
create or replace function public.claim_processing_job(
  p_worker text,
  p_user_id uuid default null,
  p_lease_seconds integer default 300
)
returns setof public.document_processing_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.document_processing_jobs j
     set status = 'running',
         locked_at = now(),
         locked_by = left(p_worker, 100),
         started_at = coalesce(j.started_at, now())
   where j.id = (
     select q.id
       from public.document_processing_jobs q
      where ((q.status = 'queued' and q.run_after <= now())
          or (q.status = 'running' and q.locked_at < now() - make_interval(secs => p_lease_seconds)))
        and (p_user_id is null or q.user_id = p_user_id)
      order by q.run_after, q.created_at
      for update skip locked
      limit 1
   )
  returning j.*;
end;
$$;
revoke execute on function public.claim_processing_job(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_processing_job(text, uuid, integer) to service_role;

-- Library listing helper: which plans use each material (owner-scoped through RLS).
create index if not exists study_plan_materials_material_user_idx on public.study_plan_materials (material_id, user_id);
