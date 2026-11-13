import type { HeadingCandidate } from "./extract/types";

export type SectionDraft = {
  key: string;
  parentKey: string | null;
  level: 1 | 2;
  position: number;
  title: string;
  start_page: number;
  end_page: number;
  estimated_minutes: number;
};

/** Average reading pace for study material (slower than leisure reading). */
export const STUDY_WORDS_PER_MINUTE = 160;

/**
 * Builds a two-level outline (chapter → subtopic) with page ranges from headings.
 * A section ends on the page where the next section of the same or higher level
 * starts (shared boundary pages are kept in both, so content is never dropped).
 */
export function buildSections(
  headings: HeadingCandidate[],
  pageCount: number,
  wordsPerPage: (page: number) => number,
): SectionDraft[] {
  const clean = headings
    .filter((h) => h.page >= 1 && h.page <= pageCount && h.title.trim())
    .map((h) => ({ ...h, title: h.title.replace(/\s+/g, " ").trim().slice(0, 300) }))
    .sort((a, b) => a.page - b.page);

  // Collapse duplicates (e.g. running headers repeated on many pages).
  const seen = new Map<string, number>();
  for (const h of clean) seen.set(h.title.toLowerCase(), (seen.get(h.title.toLowerCase()) ?? 0) + 1);
  const repeated = (t: string) => (seen.get(t.toLowerCase()) ?? 0) > Math.max(3, pageCount / 4);
  let list = clean.filter((h) => !repeated(h.title));

  // If everything is level 2, promote to chapters.
  if (list.length && list.every((h) => h.level === 2)) list = list.map((h) => ({ ...h, level: 1 as const }));
  if (!list.length) return [];

  const minutes = (from: number, to: number) => {
    let words = 0;
    for (let p = from; p <= to; p++) words += wordsPerPage(p);
    return Math.max(1, Math.round(words / STUDY_WORDS_PER_MINUTE));
  };

  const out: SectionDraft[] = [];
  // Content before the first heading becomes an introduction chapter.
  if (list[0].page > 1 || (list[0].level === 2)) {
    list.unshift({ title: "Introduction", level: 1, page: 1 });
  }

  let chapterKey: string | null = null;
  let chapterPos = 0;
  let subPos = 0;
  list.forEach((h, i) => {
    const nextSameOrHigher = list.slice(i + 1).find((n) => n.level <= h.level);
    const end = nextSameOrHigher ? Math.max(h.page, nextSameOrHigher.page) : pageCount;
    const key = `s${i}`;
    if (h.level === 1) {
      chapterKey = key;
      subPos = 0;
      out.push({ key, parentKey: null, level: 1, position: chapterPos++, title: h.title, start_page: h.page, end_page: end, estimated_minutes: minutes(h.page, end) });
    } else {
      const chapter = out.find((s) => s.key === chapterKey);
      const subEnd = chapter ? Math.min(end, chapter.end_page) : end;
      out.push({ key, parentKey: chapterKey, level: 2, position: subPos++, title: h.title, start_page: h.page, end_page: Math.max(h.page, subEnd), estimated_minutes: minutes(h.page, Math.max(h.page, subEnd)) });
    }
  });
  return out;
}
