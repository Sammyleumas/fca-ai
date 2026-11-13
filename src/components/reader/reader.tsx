"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  BotMessageSquare,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Expand,
  Eye,
  Highlighter,
  ListTree,
  Loader2,
  Minimize,
  Minus,
  NotebookPen,
  Pause,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Square,
  StickyNote,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import type { ReaderData, ReaderHighlight, ReaderNote, ReaderBookmark, ReadingPrefs } from "@/lib/data/reader";
import { HIGHLIGHT_COLORS, normaliseRects, ReadingTracker, type HighlightAnchor, type HighlightColor } from "@/lib/reader/anchors";
import { cn } from "@/lib/utils/format";
import { RichText } from "@/components/tutor/rich-text";
import { PdfView, type PdfHandle } from "./pdf-view";
import { TextView, READER_THEMES, textOffsetsFromRange } from "./text-view";
import { serverReaderApi, type ReaderApi } from "./reader-api";
import { useTts } from "./use-tts";

type Panel = "contents" | "notes" | "bookmarks" | "search" | "ai";
type Selection = { page: number; text: string; anchor: HighlightAnchor; box: DOMRect };
type AiAction = "explain" | "summarise" | "example" | "questions" | "terms" | "ask";
type AiState = { action: AiAction; label: string; page: number; selection?: string; question?: string; text: string; loading: boolean; error?: string };

export type ReaderTask = { id: string; title: string; start_page: number | null; end_page: number | null; status: string; session_id: string };

const AI_LABELS: Record<AiAction, string> = {
  explain: "Explain this simply",
  summarise: "Summarise",
  example: "Give me an example",
  questions: "Practice questions",
  terms: "Explain difficult terms",
  ask: "Your question",
};

export function Reader({
  data,
  initialPage,
  task,
  backHref,
  api = serverReaderApi,
  aiEnabled,
}: {
  data: ReaderData;
  initialPage?: number;
  task?: ReaderTask | null;
  backHref: string;
  api?: ReaderApi;
  aiEnabled: boolean;
}) {
  const { material } = data;
  const isPdf = material.file_type === "pdf";
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfHandle = useRef<PdfHandle | null>(null);

  const [prefs, setPrefs] = useState<ReadingPrefs>(data.prefs);
  const [highlights, setHighlights] = useState<ReaderHighlight[]>(data.highlights);
  const [notes, setNotes] = useState<ReaderNote[]>(data.notes);
  const [bookmarks, setBookmarks] = useState<ReaderBookmark[]>(data.bookmarks);
  const [pageCount, setPageCount] = useState(isPdf ? material.page_count : (data.pages?.length ?? 1));
  const [page, setPage] = useState(initialPage ?? data.progress?.current_page ?? 1);
  const [percent, setPercent] = useState(data.progress?.percent ?? 0);
  const [readPages, setReadPages] = useState<Set<number>>(new Set(data.progress?.pages_read ?? []));
  const [panel, setPanel] = useState<Panel | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [activeHl, setActiveHl] = useState<{ h: ReaderHighlight; box: DOMRect } | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ page: number; highlightId: string | null; quote?: string; id?: string; body: string } | null>(null);
  const [ai, setAi] = useState<AiState | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [ready, setReady] = useState(!isPdf);
  const [toast, setToast] = useState<string>();
  const [searchTerm, setSearchTerm] = useState("");
  const [taskDone, setTaskDone] = useState(task?.status === "completed");
  const aiAbort = useRef<AbortController | null>(null);
  const tts = useTts();

  const flash = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? undefined : t)), 2600);
  }, []);

  // Desktop opens the contents panel by default.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- depends on viewport width, known only in the browser
    if (window.matchMedia("(min-width: 1024px)").matches && !prefs.focus_mode) setPanel("contents");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------------------------------------------- navigation */
  const pageEl = useCallback((n: number) => scrollRef.current?.querySelector<HTMLElement>(`[data-page="${n}"]`) ?? null, []);
  const goTo = useCallback(
    (n: number, offset = 0, smooth = true) => {
      const target = Math.min(Math.max(1, n), pageCount);
      const el = pageEl(target);
      const sc = scrollRef.current;
      if (!el || !sc) return;
      sc.scrollTo({ top: el.offsetTop - 12 + offset * el.offsetHeight, behavior: smooth ? "smooth" : "auto" });
      setPage(target);
    },
    [pageCount, pageEl],
  );

  // Resume where the student stopped (or at the requested page).
  const resumed = useRef(false);
  useEffect(() => {
    if (!ready || resumed.current) return;
    resumed.current = true;
    const offset = initialPage ? 0 : (data.progress?.scroll_offset ?? 0);
    requestAnimationFrame(() => goTo(initialPage ?? data.progress?.current_page ?? 1, offset, false));
  }, [ready, goTo, initialPage, data.progress]);

  // Current page = the page occupying the most of the viewport.
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc || !ready) return;
    const ratios = new Map<number, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) ratios.set(Number((e.target as HTMLElement).dataset.page), e.intersectionRect.height);
        let best = 0;
        let bestH = -1;
        for (const [p, h] of ratios) if (h > bestH) [best, bestH] = [p, h];
        if (best && resumed.current) setPage(best);
      },
      { root: sc, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
    );
    sc.querySelectorAll("[data-page]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ready, pageCount]);

  /* ------------------------------------------------- progress & reading time */
  const tracker = useRef(new ReadingTracker());
  const lastInput = useRef(Date.now());
  const pageRef = useRef(page);
  pageRef.current = page;
  const ttsRef = useRef(tts.state);
  ttsRef.current = tts.state;

  const progressBody = useCallback(
    (batch: { seconds: number; pages: number[] }) => {
      const el = pageEl(pageRef.current);
      const sc = scrollRef.current;
      const offset = el && sc ? Math.min(1, Math.max(0, (sc.scrollTop - el.offsetTop) / Math.max(1, el.offsetHeight))) : 0;
      return { materialId: material.id, currentPage: pageRef.current, scrollOffset: Math.round(offset * 1000) / 1000, pagesRead: batch.pages, seconds: batch.seconds };
    },
    [material.id, pageEl],
  );

  useEffect(() => {
    const onInput = () => (lastInput.current = Date.now());
    const opts = { passive: true } as const;
    window.addEventListener("pointerdown", onInput, opts);
    window.addEventListener("keydown", onInput, opts);
    window.addEventListener("wheel", onInput, opts);
    window.addEventListener("touchmove", onInput, opts);
    const sc = scrollRef.current;
    sc?.addEventListener("scroll", onInput, opts);

    const tick = window.setInterval(() => {
      tracker.current.tick({
        visible: document.visibilityState === "visible",
        secondsSinceInput: (Date.now() - lastInput.current) / 1000,
        currentPage: pageRef.current,
        listening: ttsRef.current === "playing",
      });
    }, 1000);

    let lastSavedPage = pageRef.current;
    const save = async (beacon = false) => {
      const batch = tracker.current.drain();
      if (!batch.seconds && !batch.pages.length && lastSavedPage === pageRef.current && !beacon) return;
      lastSavedPage = pageRef.current;
      if (batch.pages.length) setReadPages((s) => new Set([...s, ...batch.pages]));
      try {
        const r = await api.saveProgress(progressBody(batch), beacon);
        if (r) setPercent(r.percent);
      } catch {
        tracker.current.restore(batch); // retried on the next save
      }
    };
    const every = window.setInterval(() => void save(), 20_000);
    const onHide = () => {
      if (document.visibilityState === "hidden") void save(true);
    };
    const onPageHide = () => void save(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(every);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pointerdown", onInput);
      window.removeEventListener("keydown", onInput);
      window.removeEventListener("wheel", onInput);
      window.removeEventListener("touchmove", onInput);
      sc?.removeEventListener("scroll", onInput);
      void save(true);
    };
  }, [api, progressBody]);

  /* ------------------------------------------------------------- prefs */
  const prefsTimer = useRef<number | null>(null);
  const updatePrefs = (p: Partial<ReadingPrefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      if (prefsTimer.current) window.clearTimeout(prefsTimer.current);
      prefsTimer.current = window.setTimeout(() => void api.saveReadingPrefs(next), 800);
      return next;
    });
  };

  /* ---------------------------------------------------------- selection */
  useEffect(() => {
    let t: number | null = null;
    const read = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return setSelection(null);
      const range = sel.getRangeAt(0);
      const startPage = (range.startContainer.parentElement ?? (range.startContainer as Element)).closest<HTMLElement>("[data-page]");
      const endPage = (range.endContainer.parentElement ?? (range.endContainer as Element)).closest<HTMLElement>("[data-page]");
      if (!startPage || startPage !== endPage || !scrollRef.current?.contains(startPage)) return setSelection(null);
      const text = sel.toString().replace(/\s+/g, " ").trim().slice(0, 5000);
      if (text.length < 2) return setSelection(null);
      const n = Number(startPage.dataset.page);
      let anchor: HighlightAnchor | null = null;
      if (isPdf) {
        const rects = normaliseRects([...range.getClientRects()], startPage.getBoundingClientRect());
        if (rects.length) anchor = { type: "pdf", rects };
      } else {
        const off = textOffsetsFromRange(range);
        if (off) anchor = { type: "text", ...off };
      }
      if (!anchor) return setSelection(null);
      setActiveHl(null);
      setSelection({ page: n, text, anchor, box: range.getBoundingClientRect() });
    };
    const onChange = () => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(read, 220);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, [isPdf]);

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  /* ------------------------------------------------------------ actions */
  const addHighlight = async (color: HighlightColor, thenNote = false) => {
    if (!selection) return;
    const s = selection;
    clearSelection();
    const r = await api.createHighlight({ materialId: material.id, page: s.page, text: s.text, color, anchor: s.anchor });
    if (!r.ok) return flash(r.error);
    setHighlights((h) => [...h, r.highlight]);
    if (thenNote) {
      setNoteDraft({ page: s.page, highlightId: r.highlight.id, quote: s.text, body: "" });
    } else flash("Highlighted");
  };

  const saveNoteDraft = async () => {
    if (!noteDraft?.body.trim()) return;
    const r = await api.saveNote({ id: noteDraft.id, materialId: material.id, page: noteDraft.page, highlightId: noteDraft.highlightId, body: noteDraft.body });
    if (!r.ok) return flash(r.error);
    setNotes((ns) => [r.note, ...ns.filter((n) => n.id !== r.note.id)]);
    setNoteDraft(null);
    flash("Note saved");
  };

  const toggleBookmark = async () => {
    const r = await api.toggleBookmark(material.id, page);
    if (!r.ok) return flash(r.error);
    setBookmarks((b) => (r.bookmark ? [...b, r.bookmark].sort((a, c) => a.page_number - c.page_number) : b.filter((x) => x.page_number !== page)));
    flash(r.bookmark ? `Bookmarked page ${page}` : "Bookmark removed");
  };

  const runAi = async (action: AiAction, opts: { selection?: string; question?: string; page?: number } = {}) => {
    if (!aiEnabled) return flash("AI isn't configured on this server yet.");
    aiAbort.current?.abort();
    const controller = new AbortController();
    aiAbort.current = controller;
    const p = opts.page ?? selection?.page ?? page;
    const st: AiState = { action, label: AI_LABELS[action], page: p, selection: opts.selection, question: opts.question, text: "", loading: true };
    setAi(st);
    setPanel("ai");
    clearSelection();
    try {
      const res = await api.explain({ materialId: material.id, page: p, action, selection: opts.selection, question: opts.question }, controller.signal);
      if (!res.ok || !res.body) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "The AI assistant is unavailable right now.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setAi((a) => (a && a === st ? a : a) && { ...st, text: acc.replace(/\n*\[\[error:[^\]]*\]\]\s*$/, ""), loading: true });
      }
      const err = acc.match(/\[\[error:([^\]]*)\]\]\s*$/);
      setAi({ ...st, text: acc.replace(/\n*\[\[error:[^\]]*\]\]\s*$/, ""), loading: false, error: err?.[1] });
    } catch (e) {
      if (controller.signal.aborted) return;
      setAi({ ...st, loading: false, error: e instanceof Error ? e.message : "Something went wrong." });
    }
  };

  const readAloud = async () => {
    if (tts.state === "playing") return tts.pause();
    if (tts.state === "paused") return tts.resume();
    const speakPage = async (n: number) => {
      const text = isPdf ? ((await pdfHandle.current?.getPageText(n)) ?? "") : (data.pages?.find((p) => p.page === n)?.content ?? "");
      if (!text.trim()) return flash("There's no readable text on this page.");
      tts.play(text, () => {
        if (n < pageCount) {
          goTo(n + 1);
          void speakPage(n + 1);
        }
      });
    };
    await speakPage(page);
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === "j") {
        e.preventDefault();
        goTo(page + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp" || e.key === "k") {
        e.preventDefault();
        goTo(page - 1);
      } else if (e.key === "Escape") {
        setSelection(null);
        setActiveHl(null);
        setShowPrefs(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, page]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.().catch(() => flash("Fullscreen isn't available here."));
  };

  /* ------------------------------------------------------------ derived */
  const leaves = useMemo(() => {
    const hasChild = new Set(data.sections.map((s) => s.parent_id).filter(Boolean));
    return data.sections.filter((s) => !hasChild.has(s.id));
  }, [data.sections]);
  const currentSection = useMemo(
    () => [...leaves].reverse().find((s) => s.start_page <= page && s.end_page >= page) ?? null,
    [leaves, page],
  );
  const sectionDone = (s: { start_page: number; end_page: number }) => {
    for (let p = s.start_page; p <= Math.min(s.end_page, pageCount); p++) if (!readPages.has(p)) return false;
    return true;
  };
  const bookmarked = bookmarks.some((b) => b.page_number === page);
  const focus = prefs.focus_mode;
  const theme = READER_THEMES[prefs.theme];

  return (
    <div
      ref={rootRef}
      className={cn("flex h-dvh flex-col bg-bg text-fg", isPdf && prefs.dark_pdf && "reader-dark-pdf")}
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest("[data-hl-menu]")) setActiveHl(null);
      }}
    >
      {/* Top bar */}
      <header className={cn("relative z-40 flex h-14 shrink-0 items-center gap-1 border-b border-line bg-bg/90 px-2 backdrop-blur-xl sm:h-16 sm:gap-2 sm:px-4", focus && "opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100")}>
        <Link href={backHref} className="focus-ring flex size-10 shrink-0 items-center justify-center rounded-full text-fg-2 hover:bg-white/5 hover:text-fg" aria-label="Back">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold sm:text-base">{material.title}</h1>
          <p className="text-[11px] text-fg-2 sm:text-xs">
            Page {page} of {pageCount}
            {material.pages_are_estimated ? " (estimated)" : ""} · <span className="font-semibold text-accent">{Math.round(percent)}%</span>
            {currentSection ? <span className="hidden sm:inline"> · {currentSection.title}</span> : null}
          </p>
        </div>
        <ToolbarButton label="Search in document" active={panel === "search"} onClick={() => setPanel(panel === "search" ? null : "search")}><Search className="size-[18px]" /></ToolbarButton>
        <ToolbarButton label={bookmarked ? "Remove bookmark" : "Bookmark this page"} active={bookmarked} onClick={toggleBookmark}>
          {bookmarked ? <BookmarkCheck className="size-[18px]" /> : <Bookmark className="size-[18px]" />}
        </ToolbarButton>
        {tts.supported && (
          <ToolbarButton label={tts.state === "playing" ? "Pause reading aloud" : "Read aloud"} active={tts.state !== "idle"} onClick={readAloud}>
            {tts.state === "playing" ? <Pause className="size-[18px]" /> : <Volume2 className="size-[18px]" />}
          </ToolbarButton>
        )}
        {tts.state !== "idle" && (
          <ToolbarButton label="Stop reading aloud" onClick={tts.stop} className="hidden sm:flex"><Square className="size-4" /></ToolbarButton>
        )}
        <div className="relative">
          <ToolbarButton label="Reading preferences" active={showPrefs} onClick={() => setShowPrefs((v) => !v)}><Settings2 className="size-[18px]" /></ToolbarButton>
          {showPrefs && (
            <PrefsMenu
              isPdf={isPdf}
              prefs={prefs}
              onChange={updatePrefs}
              ttsRate={tts.rate}
              onTtsRate={tts.supported ? tts.setRate : undefined}
              onClose={() => setShowPrefs(false)}
            />
          )}
        </div>
        <ToolbarButton label={focus ? "Exit focus mode" : "Focus mode"} active={focus} onClick={() => { updatePrefs({ focus_mode: !focus }); if (!focus) setPanel(null); }} className="hidden sm:flex"><Eye className="size-[18px]" /></ToolbarButton>
        <ToolbarButton label={fullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={toggleFullscreen} className="hidden md:flex">{fullscreen ? <Minimize className="size-[18px]" /> : <Expand className="size-[18px]" />}</ToolbarButton>
        <ToolbarButton label="Contents, notes and AI" active={panel !== null && panel !== "search"} onClick={() => setPanel(panel && panel !== "search" ? null : "contents")}><ListTree className="size-[18px]" /></ToolbarButton>
      </header>

      {task && (
        <div className={cn("flex shrink-0 items-center gap-3 border-b border-accent/20 bg-accent/10 px-4 py-2 text-sm", focus && "hidden")}>
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold text-accent">Today&apos;s task:</span> {task.title}
            {task.start_page ? ` · p. ${task.start_page}–${task.end_page ?? task.start_page}` : ""}
          </span>
          {taskDone ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-accent"><Check className="size-4" aria-hidden="true" /> Done</span>
          ) : (
            <button
              type="button"
              className="focus-ring shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-[#0b0c0b]"
              onClick={async () => {
                const r = await api.completeTask(task.id);
                if (!r.ok) return flash(r.error);
                setTaskDone(true);
                flash(r.streak ? `Task complete · ${r.streak}-day streak` : "Task complete");
              }}
            >
              Mark task complete
            </button>
          )}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* Document */}
        <div ref={scrollRef} className={cn("min-w-0 flex-1 overflow-y-auto px-2 py-4 sm:px-6 sm:py-6", !isPdf && prefs.theme !== "dark" && "bg-[#1a1b1a]")} tabIndex={-1}>
          {isPdf ? (
            <PdfView
              fileUrl={() => api.fileUrl(material.id)}
              pageCount={material.page_count}
              zoom={prefs.zoom}
              highlights={highlights}
              onReady={(h, n) => {
                pdfHandle.current = h;
                setPageCount(n);
                setReady(true);
              }}
              onHighlightClick={(h, el) => setActiveHl({ h, box: el.getBoundingClientRect() })}
            />
          ) : (
            <TextView
              pages={data.pages ?? []}
              prefs={prefs}
              highlights={highlights}
              searchTerm={panel === "search" ? searchTerm : undefined}
              onHighlightClick={(h, el) => setActiveHl({ h, box: el.getBoundingClientRect() })}
            />
          )}
          <div className="h-24 md:h-8" />
        </div>

        {/* Side panel */}
        {panel && (
          <aside
            className={cn(
              "glass-strong z-30 flex flex-col",
              "fixed inset-x-0 bottom-0 max-h-[75dvh] rounded-t-[1.75rem] lg:static lg:max-h-none lg:w-[380px] lg:rounded-none lg:border-y-0 lg:border-r-0",
            )}
            aria-label="Reader panel"
          >
            <div className="flex items-center gap-1 border-b border-line px-2 py-2">
              {(["contents", "notes", "bookmarks", "search", "ai"] as Panel[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPanel(p)}
                  aria-pressed={panel === p}
                  className={cn("focus-ring flex-1 rounded-full px-2 py-1.5 text-xs font-medium capitalize", panel === p ? "bg-accent text-[#0b0c0b]" : "text-fg-2 hover:text-fg")}
                >
                  {p === "ai" ? "AI" : p}
                </button>
              ))}
              <button type="button" onClick={() => setPanel(null)} className="focus-ring flex size-8 items-center justify-center rounded-full text-fg-2 hover:text-fg" aria-label="Close panel">
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {panel === "contents" && (
                <ContentsPanel sections={data.sections} currentId={currentSection?.id} isDone={sectionDone} onGo={(p) => { goTo(p); if (!window.matchMedia("(min-width: 1024px)").matches) setPanel(null); }} />
              )}
              {panel === "notes" && (
                <NotesPanel
                  highlights={highlights}
                  notes={notes}
                  onGo={goTo}
                  onEdit={(n) => setNoteDraft({ id: n.id, page: n.page_number ?? page, highlightId: n.highlight_id, body: n.body })}
                  onDeleteNote={async (id) => { const r = await api.deleteNote(id); if (r.ok) setNotes((ns) => ns.filter((n) => n.id !== id)); else flash(r.error); }}
                  onDeleteHighlight={async (id) => { const r = await api.deleteHighlight(id); if (r.ok) setHighlights((hs) => hs.filter((h) => h.id !== id)); else flash(r.error); }}
                  onNewNote={() => setNoteDraft({ page, highlightId: null, body: "" })}
                />
              )}
              {panel === "bookmarks" && (
                <BookmarksPanel bookmarks={bookmarks} page={page} onToggle={toggleBookmark} onGo={goTo} />
              )}
              {panel === "search" && (
                <SearchPanel materialId={material.id} api={api} onGo={goTo} term={searchTerm} setTerm={setSearchTerm} />
              )}
              {panel === "ai" && (
                <AiPanel
                  ai={ai}
                  enabled={aiEnabled}
                  page={page}
                  sectionTitle={currentSection?.title}
                  onRun={(a, q) => runAi(a, { question: q, page })}
                  tutorHref={`/tutor?material=${material.id}${currentSection ? `&section=${currentSection.id}` : ""}`}
                />
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Bottom navigation */}
      <footer className={cn("z-20 flex h-14 shrink-0 items-center gap-3 border-t border-line bg-bg/90 px-3 backdrop-blur-xl", focus && "opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100")}>
        <button type="button" onClick={() => goTo(page - 1)} disabled={page <= 1} className="focus-ring flex h-10 items-center gap-1 rounded-full px-3 text-sm text-fg-2 hover:text-fg disabled:opacity-40">
          <ChevronLeft className="size-4" aria-hidden="true" /> Previous
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-label="Material progress">
            <div className="h-full rounded-full bg-gradient-to-r from-accent-2 to-accent" style={{ width: `${Math.min(100, percent)}%` }} />
          </div>
          <form
            className="hidden items-center gap-1 text-xs text-fg-2 sm:flex"
            onSubmit={(e) => {
              e.preventDefault();
              goTo(Number(new FormData(e.currentTarget).get("p")));
            }}
          >
            <label htmlFor="goto-page" className="sr-only">Go to page</label>
            <input id="goto-page" name="p" type="number" min={1} max={pageCount} key={page} defaultValue={page} className="w-14 rounded-lg border border-line bg-transparent px-2 py-1 text-center text-fg outline-none focus:border-accent" />
            / {pageCount}
          </form>
        </div>
        <button type="button" onClick={() => goTo(page + 1)} disabled={page >= pageCount} className="focus-ring flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-accent disabled:opacity-40">
          Next <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </footer>

      {/* Selection toolbar */}
      {selection && !noteDraft && (
        <SelectionToolbar
          box={selection.box}
          aiEnabled={aiEnabled}
          onHighlight={(c) => addHighlight(c)}
          onNote={() => addHighlight("yellow", true)}
          onAi={(a) => (a === "ask" ? (setAi({ action: "ask", label: AI_LABELS.ask, page: selection.page, selection: selection.text, text: "", loading: false }), setPanel("ai"), clearSelection()) : runAi(a, { selection: selection.text, page: selection.page }))}
          onCopy={async () => {
            try {
              await navigator.clipboard.writeText(selection.text);
              flash("Copied");
            } catch {
              flash("Copy isn't available here");
            }
            clearSelection();
          }}
        />
      )}

      {/* Highlight menu */}
      {activeHl && (
        <div data-hl-menu className="border border-line-strong bg-[#141615]/95 text-fg backdrop-blur-xl fixed z-50 flex items-center gap-1 rounded-full p-1.5 shadow-2xl" style={floatPos(activeHl.box)}>
          {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              onClick={async () => {
                const id = activeHl.h.id;
                const r = await api.updateHighlightColor(id, c);
                if (r.ok) setHighlights((hs) => hs.map((h) => (h.id === id ? { ...h, color: c } : h)));
                setActiveHl(null);
              }}
              className={cn("focus-ring size-6 rounded-full border-2", activeHl.h.color === c ? "border-white" : "border-transparent")}
              style={{ background: HIGHLIGHT_COLORS[c].replace(/0\.\d+\)$/, "1)") }}
            />
          ))}
          <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
          <button type="button" className="focus-ring flex size-8 items-center justify-center rounded-full text-fg-2 hover:text-fg" aria-label="Add note" onClick={() => { setNoteDraft({ page: activeHl.h.page_number, highlightId: activeHl.h.id, quote: activeHl.h.text, body: notes.find((n) => n.highlight_id === activeHl.h.id)?.body ?? "", id: notes.find((n) => n.highlight_id === activeHl.h.id)?.id }); setActiveHl(null); }}>
            <StickyNote className="size-4" />
          </button>
          <button type="button" className="focus-ring flex size-8 items-center justify-center rounded-full text-fg-2 hover:text-fg" aria-label="Explain this highlight" onClick={() => { void runAi("explain", { selection: activeHl.h.text, page: activeHl.h.page_number }); setActiveHl(null); }}>
            <Sparkles className="size-4" />
          </button>
          <button type="button" className="focus-ring flex size-8 items-center justify-center rounded-full text-fg-2 hover:text-error" aria-label="Delete highlight" onClick={async () => { const id = activeHl.h.id; const r = await api.deleteHighlight(id); if (r.ok) setHighlights((hs) => hs.filter((h) => h.id !== id)); setActiveHl(null); }}>
            <Trash2 className="size-4" />
          </button>
        </div>
      )}

      {/* Note editor */}
      {noteDraft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="Note">
          <div className="glass-strong w-full max-w-lg rounded-[1.5rem] p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold"><NotebookPen className="size-5 text-accent" aria-hidden="true" /> Note · page {noteDraft.page}</h2>
              <button type="button" onClick={() => setNoteDraft(null)} className="focus-ring flex size-9 items-center justify-center rounded-full text-fg-2 hover:text-fg" aria-label="Close"><X className="size-4" /></button>
            </div>
            {noteDraft.quote && <blockquote className="mt-3 border-l-2 border-accent pl-3 text-sm italic text-fg-2">{noteDraft.quote.slice(0, 400)}</blockquote>}
            <label htmlFor="note-body" className="sr-only">Your note</label>
            <textarea
              id="note-body"
              autoFocus
              value={noteDraft.body}
              onChange={(e) => setNoteDraft({ ...noteDraft, body: e.target.value })}
              maxLength={20000}
              rows={5}
              placeholder="Write your thoughts, a summary in your own words, or a question to revisit…"
              className="mt-3 w-full resize-y rounded-2xl border border-line bg-white/[0.04] p-3 text-sm outline-none focus:border-accent/60"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setNoteDraft(null)} className="focus-ring rounded-full px-4 py-2 text-sm text-fg-2 hover:text-fg">Cancel</button>
              <button type="button" onClick={saveNoteDraft} disabled={!noteDraft.body.trim()} className="focus-ring rounded-full bg-accent px-4 py-2 text-sm font-semibold text-[#0b0c0b] disabled:opacity-50">Save note</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className="border border-line-strong bg-[#141615]/95 text-fg backdrop-blur-xl fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm shadow-2xl">
          {toast}
        </div>
      )}
      {!isPdf && <span className={cn("hidden", theme.page)} aria-hidden="true" />}
    </div>
  );
}

/* =================================================================== parts */

function ToolbarButton({ label, onClick, active, children, className }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn("focus-ring flex size-10 shrink-0 items-center justify-center rounded-full transition", active ? "bg-accent/15 text-accent" : "text-fg-2 hover:bg-white/5 hover:text-fg", className)}
    >
      {children}
    </button>
  );
}

function floatPos(box: DOMRect): React.CSSProperties {
  const top = box.top > 90 ? box.top - 54 : box.bottom + 10;
  const left = Math.min(Math.max(8, box.left + box.width / 2 - 150), (typeof window !== "undefined" ? window.innerWidth : 400) - 308);
  return { top, left: Math.max(8, left) };
}

function SelectionToolbar({
  box,
  aiEnabled,
  onHighlight,
  onNote,
  onAi,
  onCopy,
}: {
  box: DOMRect;
  aiEnabled: boolean;
  onHighlight: (c: HighlightColor) => void;
  onNote: () => void;
  onAi: (a: AiAction) => void;
  onCopy: () => void;
}) {
  const [more, setMore] = useState(false);
  const btn = "focus-ring flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[10px] text-fg-2 hover:bg-white/5 hover:text-fg";
  return (
    <div
      role="toolbar"
      aria-label="Selected text actions"
      onMouseDown={(e) => e.preventDefault()} // keep the selection
      className="border border-line-strong bg-[#141615]/95 text-fg backdrop-blur-xl fixed inset-x-3 bottom-16 z-50 rounded-2xl p-1.5 shadow-2xl sm:inset-x-auto sm:bottom-auto sm:w-auto"
      style={typeof window !== "undefined" && window.innerWidth >= 640 ? floatPos(box) : undefined}
    >
      <div className="flex items-center justify-around gap-0.5">
        <div className="flex items-center gap-1 px-1" aria-label="Highlight colours">
          {(["lime", "yellow", "blue", "pink"] as HighlightColor[]).map((c) => (
            <button key={c} type="button" onClick={() => onHighlight(c)} aria-label={`Highlight ${c}`} className="focus-ring size-6 rounded-full border border-white/20" style={{ background: HIGHLIGHT_COLORS[c].replace(/0\.\d+\)$/, "1)") }} />
          ))}
        </div>
        <button type="button" className={btn} onClick={() => onHighlight("lime")}><Highlighter className="size-4" aria-hidden="true" /> Highlight</button>
        <button type="button" className={btn} onClick={onNote}><StickyNote className="size-4" aria-hidden="true" /> Note</button>
        {aiEnabled && (
          <button type="button" className={btn} onClick={() => onAi("explain")}><Sparkles className="size-4" aria-hidden="true" /> Explain</button>
        )}
        <button type="button" className={btn} onClick={onCopy}><Copy className="size-4" aria-hidden="true" /> Copy</button>
        {aiEnabled && (
          <button type="button" className={btn} onClick={() => setMore((v) => !v)} aria-expanded={more}><BotMessageSquare className="size-4" aria-hidden="true" /> More</button>
        )}
      </div>
      {more && (
        <div className="mt-1 grid grid-cols-2 gap-1 border-t border-line pt-1 sm:flex">
          {(["summarise", "example", "questions", "terms", "ask"] as AiAction[]).map((a) => (
            <button key={a} type="button" onClick={() => onAi(a)} className="focus-ring rounded-xl px-3 py-2 text-left text-xs text-fg-2 hover:bg-white/5 hover:text-fg">
              {a === "ask" ? "Ask a question…" : AI_LABELS[a]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PrefsMenu({
  isPdf,
  prefs,
  onChange,
  ttsRate,
  onTtsRate,
  onClose,
}: {
  isPdf: boolean;
  prefs: ReadingPrefs;
  onChange: (p: Partial<ReadingPrefs>) => void;
  ttsRate: number;
  onTtsRate?: (r: number) => void;
  onClose: () => void;
}) {
  const step = "focus-ring flex size-9 items-center justify-center rounded-full border border-line text-fg-2 hover:text-fg disabled:opacity-40";
  return (
    <div className="glass-strong absolute right-0 top-12 z-40 w-72 space-y-4 rounded-2xl p-4 shadow-2xl" role="dialog" aria-label="Reading preferences">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Reading preferences</p>
        <button type="button" onClick={onClose} className="focus-ring flex size-8 items-center justify-center rounded-full text-fg-2" aria-label="Close"><X className="size-4" /></button>
      </div>
      {isPdf ? (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-fg-2">Zoom</span>
            <span className="flex items-center gap-2">
              <button type="button" className={step} disabled={prefs.zoom <= 0.5} onClick={() => onChange({ zoom: Math.round((prefs.zoom - 0.1) * 10) / 10 })} aria-label="Zoom out"><Minus className="size-4" /></button>
              <span className="w-12 text-center font-semibold">{Math.round(prefs.zoom * 100)}%</span>
              <button type="button" className={step} disabled={prefs.zoom >= 3} onClick={() => onChange({ zoom: Math.round((prefs.zoom + 0.1) * 10) / 10 })} aria-label="Zoom in"><Plus className="size-4" /></button>
            </span>
          </div>
          <label className="flex items-center justify-between text-sm">
            <span className="text-fg-2">Dark pages</span>
            <input type="checkbox" checked={prefs.dark_pdf} onChange={(e) => onChange({ dark_pdf: e.target.checked })} className="size-5 accent-[#D6FF35]" />
          </label>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-fg-2">Font size</span>
            <span className="flex items-center gap-2">
              <button type="button" className={step} disabled={prefs.font_size <= 14} onClick={() => onChange({ font_size: prefs.font_size - 1 })} aria-label="Smaller text"><Minus className="size-4" /></button>
              <span className="w-8 text-center font-semibold">{prefs.font_size}</span>
              <button type="button" className={step} disabled={prefs.font_size >= 28} onClick={() => onChange({ font_size: prefs.font_size + 1 })} aria-label="Larger text"><Plus className="size-4" /></button>
            </span>
          </div>
          <label className="block text-sm">
            <span className="flex justify-between text-fg-2">Line spacing <span className="font-semibold text-fg">{prefs.line_height.toFixed(1)}</span></span>
            <input type="range" min={1.3} max={2.2} step={0.1} value={prefs.line_height} onChange={(e) => onChange({ line_height: Number(e.target.value) })} className="mt-2 w-full accent-[#D6FF35]" />
          </label>
          <div className="text-sm">
            <span className="text-fg-2">Theme</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(Object.keys(READER_THEMES) as (keyof typeof READER_THEMES)[]).map((t) => (
                <button key={t} type="button" onClick={() => onChange({ theme: t })} aria-pressed={prefs.theme === t} className={cn("focus-ring h-10 rounded-xl text-xs font-semibold", READER_THEMES[t].page, prefs.theme === t ? "ring-2 ring-accent" : "")}>
                  {READER_THEMES[t].label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {onTtsRate && (
        <label className="block text-sm">
          <span className="flex justify-between text-fg-2">Read-aloud speed <span className="font-semibold text-fg">{ttsRate.toFixed(1)}×</span></span>
          <input type="range" min={0.6} max={1.8} step={0.1} value={ttsRate} onChange={(e) => onTtsRate(Number(e.target.value))} className="mt-2 w-full accent-[#D6FF35]" />
        </label>
      )}
      <label className="flex items-center justify-between text-sm">
        <span className="text-fg-2">Focus mode</span>
        <input type="checkbox" checked={prefs.focus_mode} onChange={(e) => onChange({ focus_mode: e.target.checked })} className="size-5 accent-[#D6FF35]" />
      </label>
    </div>
  );
}

function ContentsPanel({
  sections,
  currentId,
  isDone,
  onGo,
}: {
  sections: ReaderData["sections"];
  currentId?: string;
  isDone: (s: { start_page: number; end_page: number }) => boolean;
  onGo: (page: number) => void;
}) {
  if (!sections.length) return <p className="p-3 text-sm text-fg-2">No table of contents was detected for this material.</p>;
  const children = (id: string | null) => sections.filter((s) => s.parent_id === id).sort((a, b) => a.start_page - b.start_page || a.position - b.position);
  const render = (id: string | null, depth: number): React.ReactNode => (
    <ul className={cn(depth > 0 && "ml-3 border-l border-line pl-2")}>
      {children(id).map((s) => {
        const leaf = !sections.some((c) => c.parent_id === s.id);
        const done = leaf && isDone(s);
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onGo(s.start_page)}
              aria-current={s.id === currentId ? "location" : undefined}
              className={cn(
                "focus-ring flex w-full items-start gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-white/5",
                s.id === currentId ? "bg-accent/10 text-fg" : depth === 0 ? "font-medium text-fg" : "text-fg-2",
              )}
            >
              <span className={cn("mt-1 flex size-3.5 shrink-0 items-center justify-center rounded-full border", done ? "border-accent bg-accent text-black" : "border-line-strong")} aria-hidden="true">
                {done && <Check className="size-2.5" strokeWidth={4} />}
              </span>
              <span className="min-w-0 flex-1">{s.title}</span>
              <span className="shrink-0 text-[11px] text-muted">{s.start_page}</span>
              {done && <span className="sr-only">(read)</span>}
            </button>
            {!leaf && render(s.id, depth + 1)}
          </li>
        );
      })}
    </ul>
  );
  return render(null, 0);
}

function NotesPanel({
  highlights,
  notes,
  onGo,
  onEdit,
  onDeleteNote,
  onDeleteHighlight,
  onNewNote,
}: {
  highlights: ReaderHighlight[];
  notes: ReaderNote[];
  onGo: (p: number) => void;
  onEdit: (n: ReaderNote) => void;
  onDeleteNote: (id: string) => void;
  onDeleteHighlight: (id: string) => void;
  onNewNote: () => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const noteFor = new Map(notes.filter((n) => n.highlight_id).map((n) => [n.highlight_id!, n]));
  const items = [
    ...highlights.map((h) => ({ kind: "h" as const, page: h.page_number, h, note: noteFor.get(h.id) })),
    ...notes.filter((n) => !n.highlight_id).map((n) => ({ kind: "n" as const, page: n.page_number ?? 1, note: n })),
  ]
    .filter((i) => !query || (i.kind === "h" && i.h.text.toLowerCase().includes(query)) || i.note?.body.toLowerCase().includes(query))
    .sort((a, b) => a.page - b.page);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <label htmlFor="notes-q" className="sr-only">Search highlights and notes</label>
        <input id="notes-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search highlights & notes…" className="h-10 min-w-0 flex-1 rounded-full border border-line bg-white/[0.04] px-4 text-sm outline-none focus:border-accent/60" />
        <button type="button" onClick={onNewNote} className="focus-ring flex h-10 shrink-0 items-center gap-1 rounded-full bg-accent px-3 text-xs font-semibold text-[#0b0c0b]"><Plus className="size-3.5" aria-hidden="true" /> Note</button>
      </div>
      {!items.length && <p className="px-1 text-sm text-fg-2">{query ? "Nothing matches." : "Select text to highlight it or add a note."}</p>}
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.kind === "h" ? i.h.id : i.note!.id} className="rounded-2xl border border-line bg-white/[0.03] p-3">
            <div className="mb-1 flex items-center justify-between">
              <button type="button" onClick={() => onGo(i.page)} className="focus-ring rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-fg-2 hover:text-fg">Page {i.page}</button>
              <div className="flex gap-0.5">
                {i.note && <button type="button" onClick={() => onEdit(i.note!)} className="focus-ring rounded-full p-1.5 text-fg-2 hover:text-fg" aria-label="Edit note"><NotebookPen className="size-3.5" /></button>}
                <button
                  type="button"
                  onClick={() => (i.kind === "h" ? onDeleteHighlight(i.h.id) : onDeleteNote(i.note!.id))}
                  className="focus-ring rounded-full p-1.5 text-fg-2 hover:text-error"
                  aria-label={i.kind === "h" ? "Delete highlight" : "Delete note"}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
            {i.kind === "h" && (
              <p className="border-l-2 pl-2 text-sm" style={{ borderColor: HIGHLIGHT_COLORS[i.h.color].replace(/0\.\d+\)$/, "1)") }}>
                {i.h.text.length > 280 ? `${i.h.text.slice(0, 280)}…` : i.h.text}
              </p>
            )}
            {i.note && <p className="mt-1.5 whitespace-pre-wrap text-sm text-fg-2">{i.note.body}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BookmarksPanel({ bookmarks, page, onToggle, onGo }: { bookmarks: ReaderBookmark[]; page: number; onToggle: () => void; onGo: (p: number) => void }) {
  const has = bookmarks.some((b) => b.page_number === page);
  return (
    <div className="space-y-3">
      <button type="button" onClick={onToggle} className="focus-ring flex h-10 w-full items-center justify-center gap-2 rounded-full border border-line text-sm hover:bg-white/5">
        {has ? <BookmarkCheck className="size-4 text-accent" aria-hidden="true" /> : <Bookmark className="size-4" aria-hidden="true" />}
        {has ? `Remove bookmark on page ${page}` : `Bookmark page ${page}`}
      </button>
      {bookmarks.length ? (
        <ul className="space-y-1.5">
          {bookmarks.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => onGo(b.page_number)} className="focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/5">
                <Bookmark className="size-4 text-accent" aria-hidden="true" /> {b.label ?? `Page ${b.page_number}`}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-1 text-sm text-fg-2">No bookmarks yet.</p>
      )}
    </div>
  );
}

function SearchPanel({ materialId, api, onGo, term, setTerm }: { materialId: string; api: ReaderApi; onGo: (p: number) => void; term: string; setTerm: (t: string) => void }) {
  const [results, setResults] = useState<{ page: number; snippet: string }[] | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  return (
    <div className="space-y-3">
      <form
        role="search"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError(undefined);
          const r = await api.searchInMaterial(materialId, term);
          setLoading(false);
          if (!r.ok) {
            setError(r.error);
            setResults(null);
          } else setResults(r.results);
        }}
        className="flex gap-2"
      >
        <label htmlFor="doc-search" className="sr-only">Search in document</label>
        <input id="doc-search" autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search this document…" className="h-10 min-w-0 flex-1 rounded-full border border-line bg-white/[0.04] px-4 text-sm outline-none focus:border-accent/60" />
        <button type="submit" className="focus-ring flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-[#0b0c0b]" aria-label="Search">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        </button>
      </form>
      {error && <p className="px-1 text-sm text-error">{error}</p>}
      {results && (
        <>
          <p className="px-1 text-xs text-fg-2">{results.length ? `${results.length} page${results.length === 1 ? "" : "s"} found` : "No matches."}</p>
          <ul className="space-y-1.5" aria-live="polite">
            {results.map((r) => (
              <li key={r.page}>
                <button type="button" onClick={() => onGo(r.page)} className="focus-ring w-full rounded-xl border border-line bg-white/[0.03] p-3 text-left hover:border-accent/40">
                  <span className="text-[11px] font-semibold text-accent">Page {r.page}</span>
                  <span className="mt-0.5 block text-sm text-fg-2">{r.snippet}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function AiPanel({
  ai,
  enabled,
  page,
  sectionTitle,
  onRun,
  tutorHref,
}: {
  ai: AiState | null;
  enabled: boolean;
  page: number;
  sectionTitle?: string;
  onRun: (a: AiAction, question?: string) => void;
  tutorHref: string;
}) {
  const [q, setQ] = useState("");
  if (!enabled) return <p className="p-2 text-sm text-fg-2">AI features aren&apos;t configured on this server yet.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => onRun("summarise")} className="focus-ring rounded-full border border-line px-3 py-1.5 text-xs text-fg-2 hover:text-fg">
          Summarise {sectionTitle ? "this section" : `page ${page}`}
        </button>
        <button type="button" onClick={() => onRun("explain")} className="focus-ring rounded-full border border-line px-3 py-1.5 text-xs text-fg-2 hover:text-fg">Explain page {page}</button>
        <button type="button" onClick={() => onRun("questions")} className="focus-ring rounded-full border border-line px-3 py-1.5 text-xs text-fg-2 hover:text-fg">Practice questions</button>
      </div>
      {ai && (
        <section className="rounded-2xl border border-accent/25 bg-accent/[0.06] p-4" aria-live="polite" aria-busy={ai.loading}>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
            <Sparkles className="size-3" aria-hidden="true" /> AI · {ai.label} · not part of your document
          </p>
          {ai.selection && <blockquote className="mb-3 border-l-2 border-line-strong pl-2 text-xs italic text-fg-2">{ai.selection.slice(0, 300)}{ai.selection.length > 300 ? "…" : ""}</blockquote>}
          {ai.action === "ask" && !ai.text && !ai.loading ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (q.trim()) onRun("ask", q.trim());
              }}
              className="flex gap-2"
            >
              <label htmlFor="ask-passage" className="sr-only">Your question about this passage</label>
              <input id="ask-passage" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this passage…" className="h-10 min-w-0 flex-1 rounded-full border border-line bg-white/[0.04] px-4 text-sm outline-none focus:border-accent/60" />
              <button type="submit" className="focus-ring rounded-full bg-accent px-4 text-xs font-semibold text-[#0b0c0b]">Ask</button>
            </form>
          ) : ai.text ? (
            <div className="text-sm text-fg/90"><RichText text={ai.text} /></div>
          ) : ai.loading ? (
            <p className="flex items-center gap-2 text-sm text-fg-2"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Thinking…</p>
          ) : null}
          {ai.error && <p className="mt-2 text-sm text-error" role="alert">{ai.error}</p>}
          {!ai.loading && ai.text && (
            <p className="mt-3 text-[11px] text-muted">AI can make mistakes. Check important details against the original page {ai.page}.</p>
          )}
        </section>
      )}
      <Link href={tutorHref} className="focus-ring flex items-center gap-2 rounded-2xl border border-line p-3 text-sm text-fg-2 hover:border-accent/40 hover:text-fg">
        <BotMessageSquare className="size-4 text-accent" aria-hidden="true" /> Continue in the AI Tutor (with page references)
      </Link>
      <p className="px-1 text-[11px] text-muted">Tip: select any passage in the document for Explain, Summarise, Examples, Questions and more.</p>
    </div>
  );
}
