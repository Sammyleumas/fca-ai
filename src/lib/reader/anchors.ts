import { z } from "zod";

/**
 * Highlight anchors.
 *  - PDF pages: rectangles normalised to the page (0..1), so they stay correct at
 *    any zoom level.
 *  - Text pages (DOCX/TXT): character offsets into the stored page text, so they
 *    survive font-size and line-spacing changes.
 */
export const rectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});
export const anchorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pdf"), rects: z.array(rectSchema).min(1).max(200) }),
  z.object({ type: z.literal("text"), start: z.number().int().min(0), end: z.number().int().min(1) }).refine((a) => a.end > a.start),
]);
export type Rect = z.infer<typeof rectSchema>;
export type HighlightAnchor = z.infer<typeof anchorSchema>;

export const HIGHLIGHT_COLORS = {
  lime: "rgba(214, 255, 53, 0.42)",
  yellow: "rgba(255, 214, 10, 0.42)",
  green: "rgba(67, 199, 122, 0.40)",
  blue: "rgba(80, 160, 255, 0.38)",
  pink: "rgba(255, 105, 180, 0.38)",
  orange: "rgba(255, 150, 60, 0.42)",
} as const;
export type HighlightColor = keyof typeof HIGHLIGHT_COLORS;

type Box = { left: number; top: number; width: number; height: number };

const round = (n: number) => Math.round(n * 10000) / 10000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Converts selection rectangles (client coordinates) into page-normalised rects,
 * dropping zero-size boxes and merging boxes on the same line.
 */
export function normaliseRects(rects: Box[], page: Box): Rect[] {
  const boxes = rects
    .filter((r) => r.width > 0.5 && r.height > 0.5)
    .map((r) => ({
      x: (r.left - page.left) / page.width,
      y: (r.top - page.top) / page.height,
      w: r.width / page.width,
      h: r.height / page.height,
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const merged: Rect[] = [];
  for (const b of boxes) {
    const last = merged.at(-1);
    const sameLine = last && Math.abs(last.y - b.y) < Math.min(last.h, b.h) * 0.5;
    if (last && sameLine && b.x <= last.x + last.w + 0.01) {
      const right = Math.max(last.x + last.w, b.x + b.w);
      last.y = Math.min(last.y, b.y);
      last.h = Math.max(last.h, b.h);
      last.w = right - last.x;
    } else merged.push({ ...b });
  }
  return merged
    .map((r) => ({ x: round(clamp01(r.x)), y: round(clamp01(r.y)), w: round(clamp01(r.w)), h: round(clamp01(r.h)) }))
    .filter((r) => r.w > 0 && r.h > 0)
    .slice(0, 200);
}

export type Segment = { text: string; start: number; highlightIds: string[] };

/** Splits page text into runs so overlapping highlights render as nested marks. */
export function textSegments(text: string, highlights: { id: string; start: number; end: number }[]): Segment[] {
  const valid = highlights
    .map((h) => ({ ...h, start: Math.max(0, h.start), end: Math.min(text.length, h.end) }))
    .filter((h) => h.end > h.start);
  const cuts = new Set<number>([0, text.length]);
  for (const h of valid) {
    cuts.add(h.start);
    cuts.add(h.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [s, e] = [points[i], points[i + 1]];
    if (e <= s) continue;
    out.push({ text: text.slice(s, e), start: s, highlightIds: valid.filter((h) => h.start <= s && h.end >= e).map((h) => h.id) });
  }
  return out;
}

/** Short snippet around the first case-insensitive match. */
export function snippetAround(text: string, query: string, radius = 70): string | null {
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return null;
  const s = Math.max(0, i - radius);
  const e = Math.min(text.length, i + query.length + radius);
  return `${s > 0 ? "…" : ""}${text.slice(s, e).replace(/\s+/g, " ").trim()}${e < text.length ? "…" : ""}`;
}

/**
 * Tracks active reading time and which pages were genuinely read. A page counts as
 * read after it has been the main visible page for `pageDwellSeconds`; time only
 * accrues while the tab is visible and the student interacted recently.
 */
export class ReadingTracker {
  private dwell = new Map<number, number>();
  readonly pagesRead = new Set<number>();
  private pendingPages = new Set<number>();
  private pendingSeconds = 0;

  constructor(
    private readonly pageDwellSeconds = 8,
    private readonly idleSeconds = 90,
  ) {}

  /** Call once per second. */
  tick({ visible, secondsSinceInput, currentPage, listening = false }: { visible: boolean; secondsSinceInput: number; currentPage: number; listening?: boolean }) {
    const active = visible && (secondsSinceInput <= this.idleSeconds || listening);
    if (!active) return;
    this.pendingSeconds += 1;
    const d = (this.dwell.get(currentPage) ?? 0) + 1;
    this.dwell.set(currentPage, d);
    if (d >= this.pageDwellSeconds && !this.pagesRead.has(currentPage)) {
      this.pagesRead.add(currentPage);
      this.pendingPages.add(currentPage);
    }
  }

  /** Returns and clears what hasn't been saved yet. */
  drain(): { seconds: number; pages: number[] } {
    const out = { seconds: this.pendingSeconds, pages: [...this.pendingPages].sort((a, b) => a - b) };
    this.pendingSeconds = 0;
    this.pendingPages.clear();
    return out;
  }

  /** Puts back an unsaved batch (e.g. after a failed request). */
  restore(batch: { seconds: number; pages: number[] }) {
    this.pendingSeconds += batch.seconds;
    for (const p of batch.pages) this.pendingPages.add(p);
  }
}
