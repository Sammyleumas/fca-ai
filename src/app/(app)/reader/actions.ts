"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { anchorSchema, HIGHLIGHT_COLORS, snippetAround } from "@/lib/reader/anchors";
import { parsePrefs, type ReaderHighlight, type ReaderNote } from "@/lib/data/reader";
import { createClient } from "@/lib/supabase/server";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const uuid = z.uuid();
const color = z.enum(Object.keys(HIGHLIGHT_COLORS) as [keyof typeof HIGHLIGHT_COLORS, ...(keyof typeof HIGHLIGHT_COLORS)[]]);

const highlightSchema = z.object({
  materialId: uuid,
  page: z.number().int().min(1).max(10000),
  text: z.string().trim().min(1).max(5000),
  color,
  anchor: anchorSchema,
});

export async function createHighlight(input: z.input<typeof highlightSchema>): Promise<Result<{ highlight: ReaderHighlight }>> {
  const user = await requireUser();
  const p = highlightSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "This selection can't be highlighted." };
  const supabase = await createClient();
  const { data: section } = await supabase
    .from("document_sections")
    .select("id")
    .eq("material_id", p.data.materialId)
    .lte("start_page", p.data.page)
    .gte("end_page", p.data.page)
    .order("level", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("highlights")
    .insert({
      user_id: user.id,
      material_id: p.data.materialId,
      section_id: section?.id ?? null,
      page_number: p.data.page,
      text: p.data.text,
      color: p.data.color,
      anchor: p.data.anchor,
    })
    .select("id, page_number, text, color, anchor, created_at")
    .single();
  if (error || !data) return { ok: false, error: "Could not save the highlight." };
  return { ok: true, highlight: data as ReaderHighlight };
}

export async function updateHighlightColor(id: string, c: string): Promise<Result> {
  await requireUser();
  const p = z.object({ id: uuid, c: color }).safeParse({ id, c });
  if (!p.success) return { ok: false, error: "Invalid colour." };
  const supabase = await createClient();
  const { error } = await supabase.from("highlights").update({ color: p.data.c }).eq("id", p.data.id);
  return error ? { ok: false, error: "Could not update the highlight." } : { ok: true };
}

export async function deleteHighlight(id: string): Promise<Result> {
  await requireUser();
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { error } = await supabase.from("highlights").delete().eq("id", id);
  return error ? { ok: false, error: "Could not delete the highlight." } : { ok: true };
}

const noteSchema = z.object({
  id: uuid.optional(),
  materialId: uuid,
  page: z.number().int().min(1).max(10000).nullable(),
  highlightId: uuid.nullable().optional(),
  body: z.string().trim().min(1, "Write something first.").max(20000),
});

export async function saveNote(input: z.input<typeof noteSchema>): Promise<Result<{ note: ReaderNote }>> {
  const user = await requireUser();
  const p = noteSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid note." };
  const supabase = await createClient();
  const cols = "id, page_number, highlight_id, title, body, updated_at";
  const q = p.data.id
    ? supabase.from("notes").update({ body: p.data.body }).eq("id", p.data.id).select(cols).single()
    : supabase
        .from("notes")
        .insert({
          user_id: user.id,
          material_id: p.data.materialId,
          page_number: p.data.page,
          highlight_id: p.data.highlightId ?? null,
          body: p.data.body,
        })
        .select(cols)
        .single();
  const { data, error } = await q;
  if (error || !data) return { ok: false, error: "Could not save the note." };
  return { ok: true, note: data as ReaderNote };
}

export async function deleteNote(id: string): Promise<Result> {
  await requireUser();
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { error } = await supabase.from("notes").delete().eq("id", id);
  return error ? { ok: false, error: "Could not delete the note." } : { ok: true };
}

export async function toggleBookmark(materialId: string, page: number): Promise<Result<{ bookmark: { id: string; page_number: number; label: string | null } | null }>> {
  const user = await requireUser();
  const p = z.object({ materialId: uuid, page: z.number().int().min(1).max(10000) }).safeParse({ materialId, page });
  if (!p.success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("bookmarks")
    .select("id")
    .eq("material_id", materialId)
    .eq("page_number", page)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase.from("bookmarks").delete().eq("id", existing.id);
    return error ? { ok: false, error: "Could not remove the bookmark." } : { ok: true, bookmark: null };
  }
  const { data, error } = await supabase
    .from("bookmarks")
    .insert({ user_id: user.id, material_id: materialId, page_number: page })
    .select("id, page_number, label")
    .single();
  return error || !data ? { ok: false, error: "Could not add the bookmark." } : { ok: true, bookmark: data };
}

export async function saveReadingPrefs(prefs: unknown): Promise<Result> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ reading_prefs: parsePrefs(prefs) }).eq("id", user.id);
  return error ? { ok: false, error: "Could not save your reading preferences." } : { ok: true };
}

/** Case-insensitive search within one material's text (literal match, LIKE wildcards escaped). */
export async function searchInMaterial(materialId: string, query: string): Promise<Result<{ results: { page: number; snippet: string }[] }>> {
  await requireUser();
  const p = z.object({ materialId: uuid, query: z.string().trim().min(2).max(200) }).safeParse({ materialId, query });
  if (!p.success) return { ok: false, error: "Type at least 2 characters." };
  const supabase = await createClient();
  const escaped = p.data.query.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await supabase
    .from("material_pages")
    .select("page_number, content")
    .eq("material_id", p.data.materialId)
    .ilike("content", `%${escaped}%`)
    .order("page_number")
    .limit(100);
  if (error) return { ok: false, error: "Search failed." };
  return {
    ok: true,
    results: (data ?? []).map((r) => ({ page: r.page_number as number, snippet: snippetAround(r.content as string, p.data.query) ?? "" })),
  };
}
