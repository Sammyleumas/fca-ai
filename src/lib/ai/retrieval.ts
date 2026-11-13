import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Passage = { id: number; materialId: string; materialTitle: string; page: number; text: string };
export type Citation = { n: number; materialId: string; materialTitle: string; page: number };

const PASSAGE_CHARS = 2400;
const TOTAL_CHARS = 16_000;

/** Trims a page to the window around the first matching query term. */
export function focusText(text: string, query: string, max = PASSAGE_CHARS): string {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  if (clean.length <= max) return clean;
  const terms = query.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  const lower = clean.toLowerCase();
  const hit = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, Math.min(hit - Math.floor(max / 3), clean.length - max));
  return `${start > 0 ? "…" : ""}${clean.slice(start, start + max)}${start + max < clean.length ? "…" : ""}`;
}

/**
 * Retrieves the passages an answer should be grounded in: the pages of the section
 * the student is studying (if any) plus full-text search hits across the selected
 * materials. RLS guarantees only the student's own pages are returned.
 */
export async function retrievePassages({
  materialIds,
  query,
  section,
}: {
  materialIds: string[];
  query: string;
  section?: { materialId: string; start: number; end: number } | null;
}): Promise<Passage[]> {
  const supabase = await createClient();
  const { data: mats } = await supabase.from("materials").select("id, title").in("id", materialIds);
  const titles = new Map((mats ?? []).map((m) => [m.id as string, m.title as string]));
  const picked: Omit<Passage, "id">[] = [];
  const seen = new Set<string>();
  const add = (materialId: string, page: number, content: string) => {
    const key = `${materialId}:${page}`;
    if (seen.has(key) || !content.trim()) return;
    seen.add(key);
    picked.push({ materialId, materialTitle: titles.get(materialId) ?? "Material", page, text: focusText(content, query) });
  };

  if (section) {
    const { data } = await supabase
      .from("material_pages")
      .select("material_id, page_number, content")
      .eq("material_id", section.materialId)
      .gte("page_number", section.start)
      .lte("page_number", Math.min(section.end, section.start + 2))
      .order("page_number");
    for (const p of data ?? []) add(p.material_id, p.page_number, p.content);
  }

  const { data: hits } = await supabase.rpc("search_material_pages", {
    p_material_ids: materialIds,
    p_query: query,
    p_limit: 8,
  });
  for (const h of (hits ?? []) as { material_id: string; page_number: number; content: string }[]) add(h.material_id, h.page_number, h.content);

  const out: Passage[] = [];
  let total = 0;
  for (const p of picked) {
    if (total + p.text.length > TOTAL_CHARS && out.length) break;
    total += p.text.length;
    out.push({ ...p, id: out.length + 1 });
  }
  return out;
}

/** Keeps only citation markers that refer to passages actually provided. */
export function extractCitations(answer: string, passages: Passage[]): Citation[] {
  const used = new Set<number>();
  for (const m of answer.matchAll(/\[(\d{1,2})\]/g)) used.add(Number(m[1]));
  return passages
    .filter((p) => used.has(p.id))
    .map((p) => ({ n: p.id, materialId: p.materialId, materialTitle: p.materialTitle, page: p.page }));
}
