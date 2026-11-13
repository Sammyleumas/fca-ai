"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, Loader2, RotateCcw, UploadCloud, X, XCircle } from "lucide-react";
import { cancelUpload, finalizeUpload, prepareUpload } from "@/app/(app)/library/actions";
import { Button } from "@/components/ui/button";
import { FileBadge } from "@/components/ui/file-badge";
import { ProgressBar } from "@/components/ui/progress";
import { ACCEPT_ATTR, CANONICAL_MIME, FILE_TYPES, checkFileMeta, extensionOf } from "@/lib/materials/file-types";
import { sha256Hex, UploadAbortedError, uploadToSignedUrl } from "@/lib/materials/upload-client";
import type { FolderOption, SubjectOption } from "@/lib/data/library";
import { cn, formatBytes } from "@/lib/utils/format";
import type { MaterialFileType } from "@/types/db";

type Status = "queued" | "hashing" | "preparing" | "uploading" | "finalizing" | "done" | "error" | "cancelled" | "duplicate";
type Item = {
  key: string;
  file: File;
  fileType: MaterialFileType | null;
  status: Status;
  progress: number;
  error?: string;
  duplicateOf?: { id: string; title: string };
  allowDuplicate?: boolean;
};

const CONCURRENCY = 2;
const ACTIVE: Status[] = ["hashing", "preparing", "uploading", "finalizing"];

export function UploadPanel({
  maxBytes,
  subjects,
  folders,
  defaultSubjectId,
  defaultFolderId,
  replaceMaterialId,
  onDone,
}: {
  maxBytes: number;
  subjects: SubjectOption[];
  folders: FolderOption[];
  defaultSubjectId?: string;
  defaultFolderId?: string;
  /** When set, the panel replaces this material's file (single file). */
  replaceMaterialId?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const inputId = useId();
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [subjectId, setSubjectId] = useState(defaultSubjectId ?? "");
  const [folderId, setFolderId] = useState(defaultFolderId ?? "");
  const controllers = useRef(new Map<string, AbortController>());
  const running = useRef(new Set<string>());
  const replace = Boolean(replaceMaterialId);

  const patch = useCallback((key: string, p: Partial<Item>) => {
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));
  }, []);

  const addFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files).slice(0, replace ? 1 : 50);
    setItems((list) => [
      ...(replace ? [] : list),
      ...incoming.map((file): Item => {
        const check = checkFileMeta({ name: file.name, size: file.size, type: file.type }, maxBytes);
        return {
          key: crypto.randomUUID(),
          file,
          fileType: check.ok ? check.fileType : null,
          status: check.ok ? "queued" : "error",
          progress: 0,
          error: check.ok ? undefined : check.reason,
        };
      }),
    ]);
  };

  const run = useCallback(
    async (item: Item) => {
      const controller = new AbortController();
      controllers.current.set(item.key, controller);
      let materialId: string | undefined;
      let path: string | undefined;
      let checksum = "";
      try {
        patch(item.key, { status: "hashing", progress: 0, error: undefined });
        checksum = await sha256Hex(item.file);
        if (controller.signal.aborted) throw new UploadAbortedError();

        patch(item.key, { status: "preparing" });
        const prep = await prepareUpload({
          name: item.file.name,
          size: item.file.size,
          type: item.file.type,
          checksum,
          subjectId: subjectId || null,
          folderId: folderId || null,
          allowDuplicate: item.allowDuplicate,
          replaceMaterialId: replaceMaterialId ?? null,
        });
        if (!prep.ok) throw new Error(prep.error);
        if (prep.kind === "duplicate") {
          patch(item.key, { status: "duplicate", duplicateOf: prep.existing });
          return;
        }
        materialId = prep.materialId;
        path = prep.path;

        patch(item.key, { status: "uploading" });
        await uploadToSignedUrl(
          prep.signedUrl,
          item.file,
          CANONICAL_MIME[item.fileType ?? "pdf"],
          (f) => patch(item.key, { progress: Math.round(f * 100) }),
          controller.signal,
        );

        patch(item.key, { status: "finalizing", progress: 100 });
        const fin = await finalizeUpload({
          materialId,
          path,
          replace,
          name: item.file.name,
          size: item.file.size,
          checksum,
        });
        if (!fin.ok) throw new Error(fin.error);
        patch(item.key, { status: "done" });
        router.refresh();
      } catch (error) {
        const aborted = error instanceof UploadAbortedError || controller.signal.aborted;
        // Clean up the half-created material so a retry starts fresh.
        if (materialId) await cancelUpload(materialId, replace ? path : undefined).catch(() => undefined);
        patch(item.key, {
          status: aborted ? "cancelled" : "error",
          error: aborted ? undefined : error instanceof Error ? error.message : "Upload failed.",
        });
      } finally {
        controllers.current.delete(item.key);
        running.current.delete(item.key);
      }
    },
    [folderId, patch, replace, replaceMaterialId, router, subjectId],
  );

  // Simple queue: start queued items while fewer than CONCURRENCY are active.
  useEffect(() => {
    const active = items.filter((i) => ACTIVE.includes(i.status)).length + 0;
    const slots = CONCURRENCY - Math.max(active, running.current.size);
    if (slots <= 0) return;
    items
      .filter((i) => i.status === "queued" && !running.current.has(i.key))
      .slice(0, slots)
      .forEach((i) => {
        running.current.add(i.key);
        void run(i);
      });
  }, [items, run]);

  const allSettled = items.length > 0 && items.every((i) => ["done", "error", "cancelled", "duplicate"].includes(i.status));
  const doneCount = items.filter((i) => i.status === "done").length;

  useEffect(() => {
    if (replace && allSettled && doneCount === 1) onDone?.();
  }, [allSettled, doneCount, onDone, replace]);

  return (
    <div className="space-y-4">
      {!replace && (subjects.length > 0 || folders.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {subjects.length > 0 && (
            <label className="space-y-1.5 text-sm">
              <span className="text-fg-2">Subject / course / exam</span>
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="glass h-11 w-full rounded-xl px-3 text-fg outline-none [&>option]:bg-bg-2">
                <option value="">None</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {folders.length > 0 && (
            <label className="space-y-1.5 text-sm">
              <span className="text-fg-2">Folder / collection</span>
              <select value={folderId} onChange={(e) => setFolderId(e.target.value)} className="glass h-11 w-full rounded-xl px-3 text-fg outline-none [&>option]:bg-bg-2">
                <option value="">None</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition",
          dragging ? "border-accent bg-accent/10" : "border-line-strong hover:border-accent/60 hover:bg-white/[0.03]",
        )}
      >
        <UploadCloud className="size-9 text-accent" aria-hidden="true" />
        <span className="mt-3 font-semibold">{replace ? "Choose the replacement file" : "Drop files here or browse"}</span>
        <span className="mt-1 text-sm text-fg-2">
          PDF, DOCX or TXT · up to {formatBytes(maxBytes)} each{replace ? "" : " · select several at once"}
        </span>
        <input
          id={inputId}
          type="file"
          accept={ACCEPT_ATTR}
          multiple={!replace}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {items.length > 0 && (
        <ul className="space-y-2" aria-label="Uploads" aria-live="polite">
          {items.map((item) => (
            <li key={item.key} className="rounded-2xl border border-line bg-white/[0.03] p-3">
              <div className="flex items-center gap-3">
                {badgeType(item) ? (
                  <FileBadge type={badgeType(item)!} size={30} />
                ) : (
                  <XCircle className="size-[30px] shrink-0 text-error" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.file.name}</p>
                  <p className={cn("text-xs", item.status === "error" ? "text-error" : "text-fg-2")}>
                    {statusText(item)}
                  </p>
                </div>
                <ItemActions
                  item={item}
                  onCancel={() => {
                    if (item.status === "queued") patch(item.key, { status: "cancelled" });
                    else controllers.current.get(item.key)?.abort();
                  }}
                  onRetry={() => patch(item.key, { status: "queued", error: undefined, progress: 0 })}
                  onUploadAnyway={() => patch(item.key, { status: "queued", allowDuplicate: true, duplicateOf: undefined })}
                  onRemove={() => setItems((l) => l.filter((i) => i.key !== item.key))}
                />
              </div>
              {(item.status === "uploading" || item.status === "finalizing") && (
                <ProgressBar value={item.progress} className="mt-2.5" label={`Uploading ${item.file.name}`} />
              )}
            </li>
          ))}
        </ul>
      )}

      {allSettled && doneCount > 0 && !replace && (
        <p className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden="true" /> {doneCount} uploaded. Processing continues in the background —
          you can keep working.
        </p>
      )}
    </div>
  );
}

function badgeType(item: Item): MaterialFileType | null {
  if (item.fileType) return item.fileType;
  const ext = extensionOf(item.file.name);
  const match = (Object.keys(FILE_TYPES) as MaterialFileType[]).find((t) => FILE_TYPES[t].extensions.includes(ext));
  return match ?? null;
}

function statusText(item: Item): string {
  switch (item.status) {
    case "queued":
      return `${formatBytes(item.file.size)} · Waiting…`;
    case "hashing":
      return "Checking file…";
    case "preparing":
      return "Preparing upload…";
    case "uploading":
      return `Uploading… ${item.progress}%`;
    case "finalizing":
      return "Finishing…";
    case "done":
      return "Uploaded — processing has started";
    case "cancelled":
      return "Cancelled";
    case "duplicate":
      return `You already uploaded this file as “${item.duplicateOf?.title}”.`;
    case "error":
      return item.error ?? "Upload failed.";
  }
}

function ItemActions({
  item,
  onCancel,
  onRetry,
  onUploadAnyway,
  onRemove,
}: {
  item: Item;
  onCancel: () => void;
  onRetry: () => void;
  onUploadAnyway: () => void;
  onRemove: () => void;
}) {
  const icon = "focus-ring flex size-9 items-center justify-center rounded-full text-fg-2 hover:bg-white/5 hover:text-fg";
  if (ACTIVE.includes(item.status) || item.status === "queued") {
    return (
      <span className="flex items-center gap-1">
        {item.status !== "queued" && <Loader2 className="size-4 animate-spin text-accent" aria-hidden="true" />}
        <button type="button" className={icon} onClick={onCancel} aria-label={`Cancel upload of ${item.file.name}`}>
          <X className="size-4" />
        </button>
      </span>
    );
  }
  if (item.status === "done") return <CheckCircle2 className="size-5 text-success" aria-label="Uploaded" />;
  if (item.status === "duplicate") {
    return (
      <span className="flex items-center gap-1">
        <Button type="button" size="sm" variant="secondary" onClick={onUploadAnyway}>
          <Copy className="size-3.5" aria-hidden="true" /> Upload anyway
        </Button>
        <button type="button" className={icon} onClick={onRemove} aria-label="Skip this file">
          <X className="size-4" />
        </button>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1">
      {item.status === "error" && !item.fileType ? null : (
        <button type="button" className={icon} onClick={onRetry} aria-label={`Retry ${item.file.name}`}>
          <RotateCcw className="size-4" />
        </button>
      )}
      <button type="button" className={icon} onClick={onRemove} aria-label={`Remove ${item.file.name} from the list`}>
        <X className="size-4" />
      </button>
    </span>
  );
}
