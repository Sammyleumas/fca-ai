-- Phase 4: Reading Room.

-- Reading progress is saved through one function so concurrent saves (several tabs,
-- sendBeacon on close) merge instead of overwriting each other.
create or replace function public.save_reading_progress(
  p_material_id uuid,
  p_current_page integer,
  p_scroll_offset real,
  p_pages_read integer[],
  p_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_page_count integer;
  v_old_seconds integer;
  v_row public.reading_progress%rowtype;
  v_pages integer[];
  v_completed uuid[];
  v_new_minutes integer;
  v_seconds integer := greatest(0, least(coalesce(p_seconds, 0), 300)); -- at most 5 minutes per save
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select page_count into v_page_count from public.materials where id = p_material_id and user_id = v_uid and status = 'ready';
  if not found then raise exception 'material not found' using errcode = '22023'; end if;
  v_page_count := greatest(coalesce(v_page_count, 1), 1);

  select total_seconds into v_old_seconds from public.reading_progress where user_id = v_uid and material_id = p_material_id;
  v_old_seconds := coalesce(v_old_seconds, 0);

  insert into public.reading_progress (user_id, material_id, current_page, scroll_offset, pages_read, total_seconds, last_read_at)
  values (v_uid, p_material_id, 1, 0, '{}', 0, now())
  on conflict (user_id, material_id) do nothing;

  select * into v_row from public.reading_progress where user_id = v_uid and material_id = p_material_id for update;

  v_pages := array(
    select distinct p from unnest(v_row.pages_read || coalesce(p_pages_read, '{}')) as p
    where p between 1 and v_page_count order by p
  );

  v_completed := array(
    select s.id from public.document_sections s
    where s.material_id = p_material_id and s.user_id = v_uid
      and not exists (select 1 from public.document_sections c where c.parent_id = s.id)
      and not exists (
        select 1 from generate_series(s.start_page, least(s.end_page, v_page_count)) g where g <> all (v_pages)
      )
  );

  update public.reading_progress
     set current_page = least(greatest(coalesce(p_current_page, current_page), 1), v_page_count),
         scroll_offset = least(greatest(coalesce(p_scroll_offset, 0), 0), 1),
         pages_read = v_pages,
         completed_section_ids = v_completed,
         percent_complete = round(cardinality(v_pages)::numeric * 100 / v_page_count, 2),
         total_seconds = total_seconds + v_seconds,
         last_read_at = now()
   where id = v_row.id
  returning * into v_row;

  update public.materials set last_opened_at = now() where id = p_material_id;

  -- Whole reading minutes newly crossed count as study activity (XP only, no streak).
  v_new_minutes := (v_row.total_seconds / 60) - (v_old_seconds / 60);
  if v_new_minutes > 0 then
    perform public.record_study_activity('reading', v_new_minutes, p_material_id, null);
  end if;

  return jsonb_build_object(
    'percent', v_row.percent_complete,
    'pages_read', cardinality(v_pages),
    'total_seconds', v_row.total_seconds,
    'completed_sections', cardinality(v_completed)
  );
end;
$$;
revoke execute on function public.save_reading_progress(uuid, integer, real, integer[], integer) from public, anon;
grant execute on function public.save_reading_progress(uuid, integer, real, integer[], integer) to authenticated;

-- One highlight per exact range; notes can be found by text.
create index if not exists notes_body_search_idx on public.notes using gin (to_tsvector('simple', body));
