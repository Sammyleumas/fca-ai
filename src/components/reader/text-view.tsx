"use client";

import { memo } from "react";
import { HIGHLIGHT_COLORS, textSegments, type HighlightAnchor } from "@/lib/reader/anchors";
import type { ReaderHighlight, ReadingPrefs } from "@/lib/data/reader";
import { cn } from "@/lib/utils/format";

export const READER_THEMES = {
  dark: { page: "bg-[#0D0D33] text-[#e9ebe8]", label: "Dark" },
  sepia: { page: "bg-[#f3ead7] text-[#3a2f20]", label: "Sepia" },
  light: { page: "bg-[#fbfbf9] text-[#1c1d1c]", label: "Light" },
} as const;

/**
 * Text documents (DOCX/TXT) are shown from their extracted text, page by page.
 * Highlights are stored as character offsets so they survive font changes.
 */
export function TextView({
  pages,
  prefs,
  highlights,
  onHighlightClick,
  searchTerm,
}: {
  pages: { page: number; content: string }[];
  prefs: ReadingPrefs;
  highlights: ReaderHighlight[];
  onHighlightClick: (h: ReaderHighlight, el: HTMLElement) => void;
  searchTerm?: string;
}) {
  const byPage = new Map<number, ReaderHighlight[]>();
  for (const h of highlights) byPage.set(h.page_number, [...(byPage.get(h.page_number) ?? []), h]);
  return (
    <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-4">
      {pages.map((p) => (
        <TextPage
          key={p.page}
          page={p.page}
          content={p.content}
          prefs={prefs}
          highlights={byPage.get(p.page) ?? []}
          onHighlightClick={onHighlightClick}
          searchTerm={searchTerm}
        />
      ))}
    </div>
  );
}

const TextPage = memo(function TextPage({
  page,
  content,
  prefs,
  highlights,
  onHighlightClick,
  searchTerm,
}: {
  page: number;
  content: string;
  prefs: ReadingPrefs;
  highlights: ReaderHighlight[];
  onHighlightClick: (h: ReaderHighlight, el: HTMLElement) => void;
  searchTerm?: string;
}) {
  const ranges = highlights
    .filter((h) => (h.anchor as HighlightAnchor).type === "text")
    .map((h) => ({ id: h.id, start: (h.anchor as { start: number }).start, end: (h.anchor as { end: number }).end }));
  const byId = new Map(highlights.map((h) => [h.id, h]));
  return (
    <article
      data-page={page}
      aria-label={`Page ${page}`}
      className={cn("relative rounded-2xl px-6 py-8 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.9)] sm:px-10 sm:py-10", READER_THEMES[prefs.theme].page)}
    >
      <div
        data-text-root
        className="whitespace-pre-wrap break-words font-[Georgia,'Times_New_Roman',serif]"
        style={{ fontSize: prefs.font_size, lineHeight: prefs.line_height }}
      >
        {textSegments(content, ranges).map((seg) => {
          const top = seg.highlightIds.at(-1);
          const children = searchTerm ? withSearch(seg.text, searchTerm) : seg.text;
          return top ? (
            <mark
              key={seg.start}
              data-start={seg.start}
              className="mf-hl cursor-pointer"
              style={{ background: HIGHLIGHT_COLORS[byId.get(top)!.color] ?? HIGHLIGHT_COLORS.lime }}
              onClick={(e) => onHighlightClick(byId.get(top)!, e.currentTarget)}
            >
              {children}
            </mark>
          ) : (
            <span key={seg.start} data-start={seg.start}>
              {children}
            </span>
          );
        })}
      </div>
      <span className="pointer-events-none absolute bottom-3 right-4 text-[11px] opacity-40">{page}</span>
    </article>
  );
});

function withSearch(text: string, term: string) {
  if (term.length < 2) return text;
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((p, i) => (i % 2 ? <span key={i} className="rounded bg-accent/60 text-black">{p}</span> : p));
}

/**
 * Character offsets of a DOM selection inside a text page. Works because every
 * text run is wrapped in an element carrying its start offset (data-start).
 */
export function textOffsetsFromRange(range: Range): { start: number; end: number } | null {
  const point = (node: Node, offset: number): number | null => {
    const el = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element))?.closest<HTMLElement>("[data-start]");
    if (!el) return null;
    // Offsets inside nested search-highlight spans: count characters before `node` in el.
    let before = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (t === node) return Number(el.dataset.start) + before + offset;
      before += t.textContent?.length ?? 0;
    }
    return Number(el.dataset.start) + Math.min(offset, before);
  };
  const s = point(range.startContainer, range.startOffset);
  const e = point(range.endContainer, range.endOffset);
  if (s == null || e == null || e <= s) return null;
  return { start: s, end: e };
}
