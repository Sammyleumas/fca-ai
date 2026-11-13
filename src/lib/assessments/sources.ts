import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SourcePage } from "./questions";

export type SourceRange = { materialId: string; sectionId: string | null; title: string | null; start: number; end: number };
export type Excerpt = SourcePage & { materialTitle: string; text: string };

const PAGE_CHARS = 3000;

/**
 * Picks the page excerpts a quiz or flashcard set is generated from: every range
 * gets a fair share of the budget, pages are spread evenly across each range,
 * and text is trimmed per page. Only the student's own pages are read (RLS).
 */
export async function loadExcerpts(ranges: SourceRange[], budgetChars = 42_000): Promise<Excerpt[]> {
  const supabase = await createClient();
  const materialIds = [...new Set(ranges.map((r) => r.materialId))];
  const { data: mats } = await supabase.from("materials").select("id, title").in("id", materialIds);
  const titles = new Map((mats ?? []).map((m) => [m.id as string, m.title as string]));
  const perRange = Math.max(1, Math.floor(budgetChars / PAGE_CHARS / Math.max(1, ranges.length)));
  const out: Excerpt[] = [];
  const seen = new Set<string>();
  for (const r of ranges) {
    const total = r.end - r.start + 1;
    const step = Math.max(1, total / perRange);
    const wanted = new Set<number>();
    for (let i = 0; i < Math.min(perRange, total); i++) wanted.add(Math.min(r.end, Math.round(r.start + i * step)));
    const { data } = await supabase
      .from("material_pages")
      .select("page_number, content")
      .eq("material_id", r.materialId)
      .in("page_number", [...wanted]);
    for (const p of data ?? []) {
      const key = `${r.materialId}:${p.page_number}`;
      if (seen.has(key) || !(p.content as string).trim()) continue;
      seen.add(key);
      out.push({
        materialId: r.materialId,
        materialTitle: titles.get(r.materialId) ?? "Material",
        page: p.page_number as number,
        sectionId: r.sectionId,
        sectionTitle: r.title,
        text: (p.content as string).slice(0, PAGE_CHARS),
      });
    }
  }
  return out.sort((a, b) => (a.materialId === b.materialId ? a.page - b.page : a.materialId.localeCompare(b.materialId)));
}
