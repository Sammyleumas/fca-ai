"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CalendarDays, FolderInput, FolderPlus, Library, Plus, Search, Trash2, X } from "lucide-react";
import {
  deleteMaterials,
  moveMaterials,
  retryProcessing,
  updateMaterial,
} from "@/app/(app)/library/actions";
import { Button, buttonClasses } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { EmptyState, FormMessage } from "@/components/ui/feedback";
import { GlassCard } from "@/components/ui/glass-card";
import { TextField } from "@/components/ui/input";
import type { FolderOption, SubjectOption } from "@/lib/data/library";
import {
  LIBRARY_FILTERS,
  isProcessing,
  type LibraryFilter,
  type LibraryItem,
  type LibraryQuery,
} from "@/lib/materials/library-filter";
import { cn } from "@/lib/utils/format";
import { MaterialCard, type CardAction } from "./material-card";
import { OrganiseDialog } from "./organise-dialog";
import { StatusPoller } from "./status-poller";
import { UploadPanel } from "./upload-panel";

const FILTER_LABEL: Record<LibraryFilter, string> = {
  all: "All",
  pdf: "PDF",
  docx: "DOCX",
  txt: "TXT",
  recent: "Recently uploaded",
  studying: "Currently studying",
  completed: "Completed",
  processing: "Processing",
  failed: "Failed",
};

const selectCls = "glass h-11 rounded-full px-4 text-sm text-fg outline-none focus:border-accent/60 [&>option]:bg-bg-2";

export function LibraryView({
  items,
  total,
  counts,
  query,
  subjects,
  folders,
  maxBytes,
  maxMaterials,
  uploadOpen: initialUploadOpen,
  uploadsEnabled,
}: {
  items: LibraryItem[];
  total: number;
  counts: Record<LibraryFilter, number>;
  query: LibraryQuery;
  subjects: SubjectOption[];
  folders: FolderOption[];
  maxBytes: number;
  maxMaterials: number;
  uploadOpen: boolean;
  uploadsEnabled: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(initialUploadOpen);
  const [organiseOpen, setOrganiseOpen] = useState(false);
  const [rename, setRename] = useState<LibraryItem | null>(null);
  const [move, setMove] = useState<string[] | null>(null);
  const [replace, setReplace] = useState<LibraryItem | null>(null);
  const [remove, setRemove] = useState<string[] | null>(null);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string>();

  // Drop selections that are no longer visible.
  useEffect(() => {
    const visible = new Set(items.map((i) => i.id));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keep selection consistent with the server-filtered list
    setSelected((s) => new Set([...s].filter((id) => visible.has(id))));
  }, [items]);

  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("upload");
    const s = next.toString();
    return s ? `${pathname}?${s}` : pathname;
  };

  const processingIds = useMemo(() => items.filter((i) => isProcessing(i.status)).map((i) => i.id), [items]);
  const selectedIds = [...selected];
  const atLimit = total >= maxMaterials;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string, after?: () => void) =>
    startTransition(async () => {
      setError(undefined);
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        if (success) setNotice(success);
        after?.();
        router.refresh();
      }
    });

  const onAction = (item: LibraryItem, action: CardAction) => {
    setNotice(undefined);
    if (action === "rename") setRename(item);
    if (action === "move") setMove([item.id]);
    if (action === "replace") setReplace(item);
    if (action === "delete") setRemove([item.id]);
    if (action === "retry") {
      setBusyId(item.id);
      run(() => retryProcessing(item.id), "Processing restarted.", () => setBusyId(undefined));
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <StatusPoller ids={processingIds} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">My Library</h1>
          <p className="mt-1 text-sm text-fg-2">
            {total} of {maxMaterials} materials on your plan
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setOrganiseOpen(true)}>
            <FolderPlus className="size-4" aria-hidden="true" /> <span className="hidden sm:inline">Subjects & folders</span>
          </Button>
          <Button onClick={() => setUploadOpen(true)} disabled={!uploadsEnabled || atLimit} aria-label="Upload materials">
            <Plus className="size-4" aria-hidden="true" /> <span className="hidden sm:inline">Upload</span>
          </Button>
        </div>
      </div>

      {!uploadsEnabled && <FormMessage tone="info">Uploads aren&apos;t configured on this server yet (missing <code>SUPABASE_SECRET_KEY</code>).</FormMessage>}
      {atLimit && uploadsEnabled && (
        <FormMessage tone="info">
          You&apos;ve reached your plan&apos;s limit of {maxMaterials} materials. Delete some, or see{" "}
          <Link href="/settings/billing" className="underline">plans</Link>.
        </FormMessage>
      )}
      {error && <FormMessage>{error}</FormMessage>}
      {notice && <FormMessage tone="success">{notice}</FormMessage>}

      {/* Search + organisation filters */}
      <form action={pathname} className="flex flex-col gap-2 md:flex-row md:items-center" role="search">
        {Object.entries({ filter: query.filter !== "all" ? query.filter : undefined, sort: query.sort !== "recent" ? query.sort : undefined }).map(
          ([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />,
        )}
        <label htmlFor="library-q" className="sr-only">Search materials</label>
        <div className="glass relative flex h-12 w-full shrink-0 items-center rounded-full md:w-auto md:flex-1">
          <Search className="absolute left-4 size-[18px] text-fg-2" aria-hidden="true" />
          <input id="library-q" name="q" defaultValue={query.q} placeholder="Search materials…" className="h-full w-full rounded-full bg-transparent pl-11 pr-4 text-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/60" />
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          <select
            aria-label="Filter by subject"
            className={selectCls}
            value={query.subject ?? ""}
            onChange={(e) => router.push(href({ subject: e.target.value || undefined }))}
          >
            <option value="">All subjects</option>
            <option value="none">No subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select
            aria-label="Filter by folder"
            className={selectCls}
            value={query.folder ?? ""}
            onChange={(e) => router.push(href({ folder: e.target.value || undefined }))}
          >
            <option value="">All folders</option>
            <option value="none">Not in a folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <select aria-label="Sort" className={selectCls} value={query.sort} onChange={(e) => router.push(href({ sort: e.target.value === "recent" ? undefined : e.target.value }))}>
            <option value="recent">Newest first</option>
            <option value="opened">Recently opened</option>
            <option value="title">Title A–Z</option>
            <option value="progress">Most progress</option>
          </select>
        </div>
      </form>

      <nav aria-label="Filter materials" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
        {LIBRARY_FILTERS.filter((f) => f !== "failed" || counts.failed > 0).map((f) => {
          const active = query.filter === f;
          return (
            <Link
              key={f}
              href={href({ filter: f === "all" ? undefined : f })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "focus-ring shrink-0 rounded-full px-4 py-2 text-sm font-medium transition",
                active ? "bg-accent text-[#0b0c0b]" : "glass text-fg-2 hover:text-fg",
              )}
            >
              {FILTER_LABEL[f]} {(f === "all" || active || f === "processing" || f === "failed") && <span className="opacity-70">({counts[f]})</span>}
            </Link>
          );
        })}
      </nav>

      {items.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <MaterialCard
                item={item}
                selected={selected.has(item.id)}
                busy={pending && busyId === item.id}
                onToggle={() =>
                  setSelected((s) => {
                    const n = new Set(s);
                    if (n.has(item.id)) n.delete(item.id);
                    else n.add(item.id);
                    return n;
                  })
                }
                onAction={(a) => onAction(item, a)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <GlassCard>
          <EmptyState
            icon={<Library className="size-6" />}
            title={total ? "No materials match these filters" : "Your library is empty"}
            description={
              total
                ? "Try a different filter or search."
                : "Upload lecture notes, textbooks or past papers. MindFlow reads them, finds the chapters and gets them ready to study."
            }
            action={
              total ? (
                <Link href={pathname} className={buttonClasses({ variant: "secondary", size: "sm" })}>Clear filters</Link>
              ) : (
                <Button size="sm" onClick={() => setUploadOpen(true)} disabled={!uploadsEnabled}>
                  <Plus className="size-4" aria-hidden="true" /> Upload materials
                </Button>
              )
            }
          />
        </GlassCard>
      )}

      {total > 0 && uploadsEnabled && !atLimit && (
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="focus-ring glass flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-fg-2 hover:text-fg"
        >
          <Plus className="size-4" aria-hidden="true" /> Upload More Materials
        </button>
      )}

      {/* Bulk actions */}
      {selectedIds.length > 0 && (
        <div className="fixed inset-x-3 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-30 md:bottom-6 md:left-auto md:right-8 md:w-auto">
          <div className="glass-strong flex flex-wrap items-center gap-2 rounded-2xl p-2 pl-4 shadow-2xl" role="region" aria-label="Selected materials">
            <span className="mr-1 text-sm font-semibold">{selectedIds.length} selected</span>
            <Link
              href={`/planner/new?materials=${selectedIds.join(",")}`}
              className={buttonClasses({ size: "sm" })}
            >
              <CalendarDays className="size-4" aria-hidden="true" /> {selectedIds.length > 1 ? "Combined plan" : "Study plan"}
            </Link>
            <Button size="sm" variant="secondary" onClick={() => setMove(selectedIds)}>
              <FolderInput className="size-4" aria-hidden="true" /> Move
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setRemove(selectedIds)} aria-label="Delete selected">
              <Trash2 className="size-4 text-error" aria-hidden="true" />
            </Button>
            <button type="button" onClick={() => setSelected(new Set())} className="focus-ring flex size-9 items-center justify-center rounded-full text-fg-2 hover:text-fg" aria-label="Clear selection">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <Dialog open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload materials" description="Your files are stored privately. Processing continues even if you close this window." className="max-w-xl">
        <UploadPanel
          maxBytes={maxBytes}
          subjects={subjects}
          folders={folders}
          defaultSubjectId={query.subject && query.subject !== "none" ? query.subject : undefined}
          defaultFolderId={query.folder && query.folder !== "none" ? query.folder : undefined}
        />
      </Dialog>

      <Dialog open={Boolean(replace)} onClose={() => setReplace(null)} title="Replace file" description={replace ? `Upload a new version of “${replace.title}”. Its sections will be rebuilt; reading progress is kept.` : undefined}>
        {replace && (
          <UploadPanel
            maxBytes={maxBytes}
            subjects={[]}
            folders={[]}
            replaceMaterialId={replace.id}
            onDone={() => {
              setReplace(null);
              setNotice("File replaced — processing has restarted.");
              router.refresh();
            }}
          />
        )}
      </Dialog>

      <RenameDialog
        item={rename}
        onClose={() => setRename(null)}
        onSave={(title) => run(() => updateMaterial({ id: rename!.id, title }), "Renamed.", () => setRename(null))}
        pending={pending}
      />

      <MoveDialog
        ids={move}
        subjects={subjects}
        folders={folders}
        current={move?.length === 1 ? items.find((i) => i.id === move[0]) : undefined}
        onClose={() => setMove(null)}
        pending={pending}
        onSave={(subjectId, folderId) =>
          run(() => moveMaterials({ ids: move!, subjectId, folderId }), "Organised.", () => {
            setMove(null);
            setSelected(new Set());
          })
        }
      />

      <ConfirmDialog
        open={Boolean(remove)}
        onClose={() => setRemove(null)}
        destructive
        busy={pending}
        title={remove && remove.length > 1 ? `Delete ${remove.length} materials?` : "Delete this material?"}
        description="The original files, extracted text, notes and highlights for these materials will be permanently deleted."
        confirmLabel="Delete permanently"
        onConfirm={() =>
          run(() => deleteMaterials(remove!), remove!.length > 1 ? `${remove!.length} materials deleted.` : "Material deleted.", () => {
            setRemove(null);
            setSelected(new Set());
          })
        }
      />

      <OrganiseDialog open={organiseOpen} onClose={() => setOrganiseOpen(false)} subjects={subjects} folders={folders} />
    </div>
  );
}

function RenameDialog({ item, onClose, onSave, pending }: { item: LibraryItem | null; onClose: () => void; onSave: (t: string) => void; pending: boolean }) {
  return (
    <Dialog open={Boolean(item)} onClose={onClose} title="Rename material">
      {item && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = String(new FormData(e.currentTarget).get("title") ?? "").trim();
            if (t) onSave(t);
          }}
          className="space-y-4"
        >
          <TextField label="Title" name="title" defaultValue={item.title} maxLength={300} required autoFocus />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={pending}>Save</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function MoveDialog({
  ids,
  current,
  subjects,
  folders,
  onClose,
  onSave,
  pending,
}: {
  ids: string[] | null;
  current?: LibraryItem;
  subjects: SubjectOption[];
  folders: FolderOption[];
  onClose: () => void;
  onSave: (subjectId: string | null | undefined, folderId: string | null | undefined) => void;
  pending: boolean;
}) {
  const bulk = (ids?.length ?? 0) > 1;
  const KEEP = "__keep";
  const read = (v: FormDataEntryValue | null) => (v === KEEP ? undefined : String(v || "") || null);
  return (
    <Dialog
      open={Boolean(ids)}
      onClose={onClose}
      title={ids && ids.length > 1 ? `Organise ${ids.length} materials` : "Organise material"}
      description={!subjects.length && !folders.length ? "Create a subject or folder first from “Subjects & folders”." : undefined}
    >
      {ids && (
        <form
          key={ids.join()}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            onSave(read(fd.get("subject")), read(fd.get("folder")));
          }}
          className="space-y-4"
        >
          <label className="block space-y-1.5 text-sm">
            <span className="text-fg-2">Subject / course / exam</span>
            <select name="subject" defaultValue={bulk ? KEEP : (current?.subject?.id ?? "")} className="glass h-12 w-full rounded-xl px-3 text-fg outline-none [&>option]:bg-bg-2">
              {bulk && <option value={KEEP}>Keep as is</option>}
              <option value="">None</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.kind})</option>)}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="text-fg-2">Folder / collection</span>
            <select name="folder" defaultValue={bulk ? KEEP : (current?.folder?.id ?? "")} className="glass h-12 w-full rounded-xl px-3 text-fg outline-none [&>option]:bg-bg-2">
              {bulk && <option value={KEEP}>Keep as is</option>}
              <option value="">None</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.kind})</option>)}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={pending}>Save</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
