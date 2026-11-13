"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { HIGHLIGHT_COLORS, type HighlightAnchor } from "@/lib/reader/anchors";
import type { ReaderHighlight } from "@/lib/data/reader";

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return m;
  });
  return pdfjsPromise;
}

export type PdfHandle = { getPageText(page: number): Promise<string> };

/**
 * Renders the original PDF faithfully: a canvas per page plus PDF.js's invisible
 * text layer for selection. Pages render lazily near the viewport and release
 * their canvas when far away, so very long documents stay light.
 */
export function PdfView({
  fileUrl,
  pageCount,
  zoom,
  highlights,
  onReady,
  onHighlightClick,
}: {
  fileUrl: () => Promise<string>;
  pageCount: number;
  zoom: number;
  highlights: ReaderHighlight[];
  onReady: (handle: PdfHandle, actualPages: number) => void;
  onHighlightClick: (h: ReaderHighlight, el: HTMLElement) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [base, setBase] = useState<{ w: number; h: number } | null>(null);
  const [width, setWidth] = useState(800);
  const [error, setError] = useState<string>();
  const [near, setNear] = useState<Set<number>>(new Set([1, 2]));

  // Load the document once.
  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    let task: { destroy(): Promise<void>; promise: Promise<PDFDocumentProxy> } | null = null;
    (async () => {
      try {
        const [pdfjs, url] = await Promise.all([loadPdfJs(), fileUrl()]);
        task = pdfjs.getDocument({ url, disableAutoFetch: true });
        loaded = await task.promise;
        if (cancelled) return void task.destroy();
        const first = await loaded.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        setBase({ w: vp.width, h: vp.height });
        setDoc(loaded);
        onReady(
          {
            async getPageText(n) {
              const p = await loaded!.getPage(n);
              const tc = await p.getTextContent();
              return tc.items.map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : " ") : "")).join("").replace(/[ \t]+/g, " ").trim();
            },
          },
          loaded.numPages,
        );
      } catch {
        if (!cancelled) setError("We couldn't open this PDF. Check your connection, or download the original instead.");
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
    // fileUrl is stable per material
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track available width (fit-to-width × zoom).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Which pages are near the viewport.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !doc) return;
    const io = new IntersectionObserver(
      (entries) => {
        setNear((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const n = Number((e.target as HTMLElement).dataset.page);
            if (e.isIntersecting) next.add(n);
            else next.delete(n);
          }
          return next;
        });
      },
      { rootMargin: "1200px 0px" },
    );
    el.querySelectorAll("[data-page]").forEach((p) => io.observe(p));
    return () => io.disconnect();
  }, [doc]);

  if (error) return <p className="mx-auto max-w-md rounded-2xl border border-error/30 bg-error/10 p-4 text-sm text-[#ffb3b3]">{error}</p>;

  const fit = base ? Math.min(1.75, Math.max(0.3, (width - 8) / base.w)) : 1;
  const scale = fit * zoom;
  const total = doc?.numPages ?? pageCount;
  const byPage = new Map<number, ReaderHighlight[]>();
  for (const h of highlights) byPage.set(h.page_number, [...(byPage.get(h.page_number) ?? []), h]);

  return (
    <div ref={containerRef} className="mx-auto w-full" style={{ maxWidth: base ? base.w * 1.75 * Math.max(1, zoom) : undefined }}>
      {!doc && (
        <div className="flex h-[60vh] items-center justify-center gap-2 text-fg-2">
          <Loader2 className="size-5 animate-spin text-accent" aria-hidden="true" /> Opening your document…
        </div>
      )}
      {doc && base && (
        <div className="flex flex-col items-center gap-4">
          {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
            <PdfPage
              key={n}
              doc={doc}
              n={n}
              scale={scale}
              approx={{ w: base.w * scale, h: base.h * scale }}
              render={near.has(n)}
              highlights={byPage.get(n) ?? []}
              onHighlightClick={onHighlightClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const PdfPage = memo(function PdfPage({
  doc,
  n,
  scale,
  approx,
  render,
  highlights,
  onHighlightClick,
}: {
  doc: PDFDocumentProxy;
  n: number;
  scale: number;
  approx: { w: number; h: number };
  render: boolean;
  highlights: ReaderHighlight[];
  onHighlightClick: (h: ReaderHighlight, el: HTMLElement) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(approx);

  useEffect(() => {
    if (!render) {
      // Free memory for far-away pages.
      const c = canvasRef.current;
      if (c) {
        c.width = 0;
        c.height = 0;
      }
      if (textRef.current) textRef.current.replaceChildren();
      return;
    }
    let cancelled = false;
    let page: PDFPageProxy | null = null;
    let renderTask: { cancel(): void; promise: Promise<void> } | null = null;
    let textLayer: { cancel(): void } | null = null;
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        page = await doc.getPage(n);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        setSize({ w: viewport.width, h: viewport.height });
        const canvas = canvasRef.current!;
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        renderTask = page.render({ canvas, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
        await renderTask.promise;
        if (cancelled || !textRef.current) return;
        textRef.current.replaceChildren();
        const tl = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textRef.current, viewport });
        textLayer = tl;
        await tl.render();
      } catch {
        // Cancelled renders throw; a later pass re-renders.
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [doc, n, scale, render]);

  return (
    <div
      data-page={n}
      className="pdf-page relative overflow-hidden rounded-md bg-white shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)]"
      style={{ width: size.w, height: size.h, ["--total-scale-factor" as string]: scale, ["--scale-round-x" as string]: "1px", ["--scale-round-y" as string]: "1px" }}
      aria-label={`Page ${n}`}
      role="region"
    >
      {/* Spinner sits beneath the canvas; it disappears once the page is painted. */}
      <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <Loader2 className="size-5 animate-spin text-black/25" />
      </div>
      <canvas ref={canvasRef} className="absolute inset-0 bg-white" aria-hidden="true" style={{ width: size.w, height: size.h }} />
      {highlights.map((h) =>
        (h.anchor as Extract<HighlightAnchor, { type: "pdf" }>).rects?.map((r, i) => (
          <button
            key={`${h.id}-${i}`}
            type="button"
            tabIndex={i === 0 ? 0 : -1}
            aria-label={i === 0 ? `Highlight: ${h.text.slice(0, 80)}` : undefined}
            aria-hidden={i === 0 ? undefined : true}
            onClick={(e) => onHighlightClick(h, e.currentTarget)}
            className="absolute z-[3] cursor-pointer rounded-[2px] mix-blend-multiply"
            style={{
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${r.w * 100}%`,
              height: `${r.h * 100}%`,
              background: HIGHLIGHT_COLORS[h.color] ?? HIGHLIGHT_COLORS.lime,
            }}
          />
        )),
      )}
      <div ref={textRef} className="textLayer" />
      <span className="pointer-events-none absolute bottom-2 right-3 z-[4] text-[10px] text-black/35">{n}</span>
    </div>
  );
});
