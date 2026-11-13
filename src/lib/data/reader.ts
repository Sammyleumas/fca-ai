import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { HighlightAnchor, HighlightColor } from "@/lib/reader/anchors";
import type { MaterialFileType } from "@/types/db";

export type ReaderSection = { id: string; parent_id: string | null; level: number; position: number; title: string; start_page: number; end_page: number };
export type ReaderHighlight = { id: string; page_number: number; text: string; color: HighlightColor; anchor: HighlightAnchor; created_at: string };
export type ReaderNote = { id: string; page_number: number | null; highlight_id: string | null; title: string | null; body: string; updated_at: string };
export type ReaderBookmark = { id: string; page_number: number; label: string | null };
export type ReadingPrefs = { font_size: number; line_height: number; theme: "dark" | "sepia" | "light"; focus_mode: boolean; dark_pdf: boolean; zoom: number };

export type ReaderData = {
  material: { id: string; title: string; file_type: MaterialFileType; page_count: number; pages_are_estimated: boolean };
  sections: ReaderSection[];
  progress: { current_page: number; scroll_offset: number; percent: number; pages_read: number[]; completed_section_ids: string[]; total_seconds: number } | null;
  highlights: ReaderHighlight[];
  notes: ReaderNote[];
  bookmarks: ReaderBookmark[];
  /** Extracted page text for DOCX/TXT (rendered directly). PDFs render from the original file. */
  pages: { page: number; content: string }[] | null;
  prefs: ReadingPrefs;
};

export const DEFAULT_PREFS: ReadingPrefs = { font_size: 18, line_height: 1.7, theme: "dark", focus_mode: false, dark_pdf: false, zoom: 1 };

export function parsePrefs(raw: unknown): ReadingPrefs {
  const r = (raw ?? {}) as Partial<ReadingPrefs>;
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && v >= lo && v <= hi ? v : d);
  return {
    font_size: num(r.font_size, 14, 28, DEFAULT_PREFS.font_size),
    line_height: num(r.line_height, 1.3, 2.2, DEFAULT_PREFS.line_height),
    theme: r.theme === "sepia" || r.theme === "light" ? r.theme : "dark",
    focus_mode: Boolean(r.focus_mode),
    dark_pdf: Boolean(r.dark_pdf),
    zoom: num(r.zoom, 0.5, 3, 1),
  };
}

export async function getReaderData(userId: string, materialId: string, readingPrefs: unknown): Promise<ReaderData | null> {
  const supabase = await createClient();
  const { data: m } = await supabase
    .from("materials")
    .select("id, title, file_type, page_count, pages_are_estimated, status")
    .eq("id", materialId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!m || m.status !== "ready") return null;

  const [sections, progress, highlights, notes, bookmarks, pages] = await Promise.all([
    supabase.from("document_sections").select("id, parent_id, level, position, title, start_page, end_page").eq("material_id", materialId).order("start_page").order("level").order("position").limit(5000),
    supabase.from("reading_progress").select("current_page, scroll_offset, percent_complete, pages_read, completed_section_ids, total_seconds").eq("material_id", materialId).maybeSingle(),
    supabase.from("highlights").select("id, page_number, text, color, anchor, created_at").eq("material_id", materialId).order("page_number").order("created_at").limit(2000),
    supabase.from("notes").select("id, page_number, highlight_id, title, body, updated_at").eq("material_id", materialId).order("updated_at", { ascending: false }).limit(1000),
    supabase.from("bookmarks").select("id, page_number, label").eq("material_id", materialId).order("page_number"),
    m.file_type === "pdf"
      ? Promise.resolve({ data: null })
      : supabase.from("material_pages").select("page_number, content").eq("material_id", materialId).order("page_number").limit(3000),
  ]);

  const p = progress.data;
  return {
    material: { id: m.id, title: m.title, file_type: m.file_type, page_count: Math.max(1, m.page_count ?? 1), pages_are_estimated: m.pages_are_estimated },
    sections: (sections.data ?? []) as ReaderSection[],
    progress: p
      ? {
          current_page: p.current_page,
          scroll_offset: Number(p.scroll_offset),
          percent: Number(p.percent_complete),
          pages_read: p.pages_read ?? [],
          completed_section_ids: p.completed_section_ids ?? [],
          total_seconds: p.total_seconds,
        }
      : null,
    highlights: (highlights.data ?? []) as ReaderHighlight[],
    notes: (notes.data ?? []) as ReaderNote[],
    bookmarks: (bookmarks.data ?? []) as ReaderBookmark[],
    pages: pages.data ? (pages.data as { page_number: number; content: string }[]).map((x) => ({ page: x.page_number, content: x.content })) : null,
    prefs: parsePrefs(readingPrefs),
  };
}
