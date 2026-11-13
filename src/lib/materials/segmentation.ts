import { z } from "zod";
import { STUDY_WORDS_PER_MINUTE } from "./structure";

/**
 * AI segmentation: divides each chapter / subtopic into small learning units.
 * Documents are analysed in page-bounded windows (never the whole document at
 * once) and every AI answer is validated and normalised against the window's real
 * page range, so units always point at pages that exist.
 */

export const MAX_WINDOW_PAGES = 12;
export const MAX_WINDOW_CHARS = 24_000;

export type LeafSection = { id: string; title: string; start_page: number; end_page: number; chapterTitle: string | null };

export type AnalysisWindow = {
  startPage: number;
  endPage: number;
  parentId: string | null; // leaf section the units belong to (null when the document had no structure)
  parentTitle: string | null;
  chapterTitle: string | null;
};

export const segmentationSchema = z.object({
  window_title: z.string(),
  units: z.array(
    z.object({
      title: z.string(),
      start_page: z.number().int(),
      end_page: z.number().int(),
      summary: z.string(),
      complexity: z.number().int(),
      learning_objectives: z.array(z.string()),
      key_concepts: z.array(z.string()),
    }),
  ),
});
export type SegmentationOutput = z.infer<typeof segmentationSchema>;

export type NormalisedUnit = {
  title: string;
  start_page: number;
  end_page: number;
  summary: string | null;
  complexity: number;
  learning_objectives: string[];
  key_concepts: string[];
  estimated_minutes: number;
};

export interface SegmentationService {
  segment(input: {
    materialTitle: string;
    window: AnalysisWindow;
    pages: { page: number; text: string }[];
  }): Promise<SegmentationOutput>;
}

/** Splits leaf sections (or the whole document) into windows of bounded size. */
export function planWindows(
  leaves: LeafSection[],
  pageCount: number,
  charsPerPage: (page: number) => number,
): AnalysisWindow[] {
  const spans: { start: number; end: number; leaf: LeafSection | null }[] = leaves.length
    ? leaves.map((l) => ({ start: l.start_page, end: Math.min(l.end_page, pageCount), leaf: l }))
    : pageCount > 0
      ? [{ start: 1, end: pageCount, leaf: null }]
      : [];
  const out: AnalysisWindow[] = [];
  for (const span of spans) {
    let start = span.start;
    while (start <= span.end) {
      let end = start;
      let chars = charsPerPage(start);
      while (end < span.end && end - start + 1 < MAX_WINDOW_PAGES && chars + charsPerPage(end + 1) <= MAX_WINDOW_CHARS) {
        end++;
        chars += charsPerPage(end);
      }
      out.push({
        startPage: start,
        endPage: end,
        parentId: span.leaf?.id ?? null,
        parentTitle: span.leaf?.title ?? null,
        chapterTitle: span.leaf?.chapterTitle ?? null,
      });
      start = end + 1;
    }
  }
  return out;
}

const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Makes AI output safe to store: clamps pages into the window, orders units, closes
 * gaps (content between units is attached to the previous unit), removes empty or
 * duplicated units, bounds complexity and list sizes, and recomputes reading time
 * from the real word counts — the AI never decides how long the student reads.
 */
export function normaliseUnits(
  raw: SegmentationOutput["units"],
  window: AnalysisWindow,
  wordsPerPage: (page: number) => number,
): NormalisedUnit[] {
  const { startPage: lo, endPage: hi } = window;
  const units = raw
    .map((u) => ({
      ...u,
      title: clean(u.title, 200),
      start_page: Math.min(hi, Math.max(lo, u.start_page)),
      end_page: Math.min(hi, Math.max(lo, u.end_page)),
    }))
    .filter((u) => u.title.length > 0)
    .map((u) => (u.end_page < u.start_page ? { ...u, end_page: u.start_page } : u))
    .sort((a, b) => a.start_page - b.start_page || a.end_page - b.end_page)
    .slice(0, 12);

  const out: NormalisedUnit[] = [];
  for (const u of units) {
    const prev = out.at(-1);
    // Sorted by start, so a unit ending within the previous one is contained in it.
    if (prev && u.end_page <= prev.end_page) continue;
    if (prev && u.start_page > prev.end_page + 1) prev.end_page = u.start_page - 1; // close gap
    if (prev && u.start_page < prev.end_page) prev.end_page = u.start_page; // overlap: share one boundary page at most
    out.push({
      title: u.title,
      start_page: u.start_page,
      end_page: u.end_page,
      summary: clean(u.summary, 600) || null,
      complexity: Math.min(5, Math.max(1, Math.round(u.complexity || 3))),
      learning_objectives: u.learning_objectives.map((o) => clean(o, 200)).filter(Boolean).slice(0, 4),
      key_concepts: u.key_concepts.map((o) => clean(o, 80)).filter(Boolean).slice(0, 8),
      estimated_minutes: 0,
    });
  }
  if (!out.length) return [];
  out[0].start_page = lo;
  out.at(-1)!.end_page = hi;
  for (const u of out) {
    let words = 0;
    for (let p = u.start_page; p <= u.end_page; p++) words += wordsPerPage(p);
    // Units sharing a page each get a share of that page's reading time.
    u.estimated_minutes = Math.max(1, Math.round(words / STUDY_WORDS_PER_MINUTE));
  }
  return out;
}

export type SectionRow = {
  id: string;
  parent_id: string | null;
  level: number;
  position: number;
  title: string;
  start_page: number;
  end_page: number;
};

/** Sections without children, in reading order, annotated with their chapter title. */
export function computeLeaves(rows: SectionRow[]): LeafSection[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const hasChild = new Set(rows.map((r) => r.parent_id).filter(Boolean) as string[]);
  const chapterOf = (r: SectionRow): string | null => {
    let cur: SectionRow | undefined = r;
    while (cur?.parent_id) cur = byId.get(cur.parent_id);
    return cur?.title ?? null;
  };
  return rows
    .filter((r) => !hasChild.has(r.id))
    .sort((a, b) => a.start_page - b.start_page || a.level - b.level || a.position - b.position)
    .map((r) => ({ id: r.id, title: r.title, start_page: r.start_page, end_page: r.end_page, chapterTitle: chapterOf(r) }));
}
