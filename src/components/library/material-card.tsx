"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, Check, Download, FolderInput, Loader2, MoreVertical, Pencil, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { FileBadge } from "@/components/ui/file-badge";
import { ProgressBar } from "@/components/ui/progress";
import { isProcessing, isStaleUpload, type LibraryItem } from "@/lib/materials/library-filter";
import { clampPercent, cn, formatBytes } from "@/lib/utils/format";

export type CardAction = "rename" | "move" | "replace" | "delete" | "retry";

export function MaterialCard({
  item,
  selected,
  onToggle,
  onAction,
  busy,
}: {
  item: LibraryItem;
  selected: boolean;
  onToggle: () => void;
  onAction: (a: CardAction) => void;
  busy?: boolean;
}) {
  const stale = isStaleUpload(item);
  const processing = isProcessing(item.status) && !stale;
  const pages = item.page_count ? `${item.pages_are_estimated ? "~" : ""}${item.page_count} pages` : null;
  return (
    <article
      className={cn(
        "glass group relative flex flex-col gap-3 rounded-[var(--radius-glass)] p-4 transition",
        selected ? "border-accent/60 glow-accent" : "hover:border-line-strong",
      )}
    >
      <div className="flex items-start gap-3">
        <label className="relative mt-0.5 flex shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="peer sr-only"
            aria-label={`Select ${item.title}`}
          />
          <FileBadge type={item.file_type} size={42} />
          <span
            className={cn(
              "absolute -left-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border text-[#000000] transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
              selected ? "border-accent bg-accent" : "border-line-strong bg-bg-2 opacity-0 group-hover:opacity-100 peer-focus-visible:opacity-100",
            )}
            aria-hidden="true"
          >
            {selected && <Check className="size-3.5" strokeWidth={3} />}
          </span>
        </label>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 font-semibold leading-snug">
            <Link href={`/library/${item.id}`} className="focus-ring rounded hover:underline">
              {item.title}
            </Link>
          </h3>
          <p className="mt-0.5 text-xs text-fg-2">
            {[pages, formatBytes(item.size_bytes)].filter(Boolean).join(" • ")}
          </p>
        </div>
        <CardMenu item={item} onAction={onAction} />
      </div>

      {(item.subject || item.folder || item.plans.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {item.subject && <Tag>{item.subject.name}</Tag>}
          {item.folder && <Tag>{item.folder.name}</Tag>}
          {item.plans.slice(0, 1).map((p) => (
            <Tag key={p.id} icon={<CalendarDays className="size-3" />}>
              {p.title}
            </Tag>
          ))}
        </div>
      )}

      <div className="mt-auto">
        {stale ? (
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs text-warning">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" /> This upload didn&apos;t finish.
            </p>
            <button
              type="button"
              onClick={() => onAction("delete")}
              className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:bg-white/5"
            >
              <Trash2 className="size-3.5" aria-hidden="true" /> Remove
            </button>
          </div>
        ) : processing ? (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs text-fg-2">
              <Loader2 className="size-3.5 animate-spin text-accent" aria-hidden="true" />
              {item.status_detail ?? "Processing…"}
            </p>
            <ProgressBar value={item.processing_progress} label={`Processing ${item.title}`} />
          </div>
        ) : item.status === "failed" ? (
          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-error">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="line-clamp-2">{item.processing_error ?? "Processing failed"}</span>
            </p>
            <button
              type="button"
              onClick={() => onAction("retry")}
              disabled={busy}
              className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:bg-white/5 disabled:opacity-50"
            >
              <RotateCcw className={cn("size-3.5", busy && "animate-spin")} aria-hidden="true" /> Retry
            </button>
          </div>
        ) : item.progress > 0 ? (
          <div className="flex items-center gap-3">
            <ProgressBar value={item.progress} label={`${item.title} reading progress`} />
            <span className="text-xs font-semibold">{clampPercent(item.progress)}%</span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <ProgressBar value={0} label={`${item.title} reading progress`} />
            <span className="shrink-0 text-xs text-fg-2">Not started</span>
          </div>
        )}
      </div>
    </article>
  );
}

function Tag({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-line bg-white/[0.04] px-2.5 py-1 text-[11px] text-fg-2">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

function CardMenu({ item, onAction }: { item: LibraryItem; onAction: (a: CardAction) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const canReplace = item.status === "ready" || item.status === "failed";
  const entry = "focus-ring flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/5";
  const act = (a: CardAction) => {
    setOpen(false);
    onAction(a);
  };
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${item.title}`}
        className="focus-ring -mr-1 flex size-9 items-center justify-center rounded-full text-fg-2 hover:bg-white/5 hover:text-fg"
      >
        <MoreVertical className="size-[18px]" />
      </button>
      {open && (
        <div role="menu" className="glass-strong absolute right-0 top-10 z-20 w-52 rounded-2xl p-1.5 shadow-2xl">
          <button role="menuitem" type="button" className={entry} onClick={() => act("rename")}>
            <Pencil className="size-4" aria-hidden="true" /> Rename
          </button>
          <button role="menuitem" type="button" className={entry} onClick={() => act("move")}>
            <FolderInput className="size-4" aria-hidden="true" /> Organise…
          </button>
          {item.status !== "uploaded" && (
            <a role="menuitem" href={`/api/materials/${item.id}/file`} className={entry}>
              <Download className="size-4" aria-hidden="true" /> Download original
            </a>
          )}
          {canReplace && (
            <button role="menuitem" type="button" className={entry} onClick={() => act("replace")}>
              <RefreshCw className="size-4" aria-hidden="true" /> Replace file
            </button>
          )}
          <button role="menuitem" type="button" className={cn(entry, "text-error")} onClick={() => act("delete")}>
            <Trash2 className="size-4" aria-hidden="true" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
