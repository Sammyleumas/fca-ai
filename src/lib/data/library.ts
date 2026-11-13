import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { LibraryItem } from "@/lib/materials/library-filter";

export type SubjectOption = { id: string; name: string; kind: "subject" | "course" | "examination"; exam_date: string | null };
export type FolderOption = { id: string; name: string; kind: "folder" | "collection" };

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export async function getLibrary(userId: string): Promise<{
  items: LibraryItem[];
  subjects: SubjectOption[];
  folders: FolderOption[];
}> {
  const supabase = await createClient();
  const [materials, subjects, folders] = await Promise.all([
    supabase
      .from("materials")
      .select(
        "id, title, original_filename, file_type, size_bytes, page_count, pages_are_estimated, status, status_detail, processing_progress, processing_error, processing_warning, created_at, last_opened_at, subjects(id, name, kind), folders(id, name, kind), reading_progress(percent_complete, last_read_at), study_plan_materials(study_plans(id, title, status))",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("subjects").select("id, name, kind, exam_date").eq("user_id", userId).order("name"),
    supabase.from("folders").select("id, name, kind").eq("user_id", userId).order("name"),
  ]);
  if (materials.error || subjects.error || folders.error) throw new Error("Could not load your library.");

  const items: LibraryItem[] = (materials.data ?? []).map((m) => {
    const rp = one(m.reading_progress as { percent_complete: number; last_read_at: string } | { percent_complete: number; last_read_at: string }[] | null);
    const links = (m.study_plan_materials ?? []) as { study_plans: unknown }[];
    return {
      id: m.id,
      title: m.title,
      original_filename: m.original_filename,
      file_type: m.file_type,
      size_bytes: m.size_bytes,
      page_count: m.page_count,
      pages_are_estimated: m.pages_are_estimated,
      status: m.status,
      status_detail: m.status_detail,
      processing_progress: m.processing_progress,
      processing_error: m.processing_error,
      processing_warning: m.processing_warning,
      created_at: m.created_at,
      last_opened_at: m.last_opened_at,
      subject: one(m.subjects as LibraryItem["subject"] | LibraryItem["subject"][]),
      folder: one(m.folders as LibraryItem["folder"] | LibraryItem["folder"][]),
      progress: rp ? Number(rp.percent_complete) : 0,
      lastReadAt: rp?.last_read_at ?? null,
      plans: links
        .map((l) => one(l.study_plans as { id: string; title: string; status: string } | null))
        .filter((p): p is { id: string; title: string; status: string } => Boolean(p)),
    };
  });
  return { items, subjects: (subjects.data ?? []) as SubjectOption[], folders: (folders.data ?? []) as FolderOption[] };
}

export type MaterialDetail = LibraryItem & {
  word_count: number | null;
  ocr_page_count: number;
  sections: { id: string; parent_id: string | null; level: number; position: number; title: string; start_page: number; end_page: number; estimated_minutes: number | null; complexity: number | null; summary: string | null; source: string }[];
  previewPages: { page_number: number; content: string; ocr_used: boolean }[];
};

export async function getMaterialDetail(userId: string, id: string): Promise<MaterialDetail | null> {
  const { items } = await getLibrary(userId);
  const item = items.find((m) => m.id === id);
  if (!item) return null;
  const supabase = await createClient();
  const [extra, sections, pages] = await Promise.all([
    supabase.from("materials").select("word_count, ocr_page_count").eq("id", id).single(),
    supabase
      .from("document_sections")
      .select("id, parent_id, level, position, title, start_page, end_page, estimated_minutes, complexity, summary, source")
      .eq("material_id", id)
      .order("start_page")
      .order("level")
      .order("position")
      .limit(1000),
    supabase.from("material_pages").select("page_number, content, ocr_used").eq("material_id", id).order("page_number").limit(2),
  ]);
  return {
    ...item,
    word_count: extra.data?.word_count ?? null,
    ocr_page_count: extra.data?.ocr_page_count ?? 0,
    sections: (sections.data ?? []) as MaterialDetail["sections"],
    previewPages: (pages.data ?? []) as MaterialDetail["previewPages"],
  };
}
