"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BookMarked, Check, Folder, GraduationCap, Layers, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createFolder,
  createSubject,
  deleteFolder,
  deleteSubject,
  renameFolder,
  renameSubject,
} from "@/app/(app)/library/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/feedback";
import type { FolderOption, SubjectOption } from "@/lib/data/library";
import { cn } from "@/lib/utils/format";

const SUBJECT_KINDS = [
  { value: "subject", label: "Subject", icon: BookMarked },
  { value: "course", label: "Course", icon: Layers },
  { value: "examination", label: "Exam", icon: GraduationCap },
] as const;

const inputCls = "glass h-11 w-full rounded-xl px-3 text-sm text-fg outline-none placeholder:text-muted focus:border-accent/60";

export function OrganiseDialog({
  open,
  onClose,
  subjects,
  folders,
}: {
  open: boolean;
  onClose: () => void;
  subjects: SubjectOption[];
  folders: FolderOption[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"subjects" | "folders">("subjects");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(undefined);
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        after?.();
        router.refresh();
      }
    });

  return (
    <Dialog open={open} onClose={onClose} title="Subjects & folders" description="Group materials by subject, course or exam, and into your own folders and collections." className="max-w-xl">
      <div role="tablist" className="mb-4 grid grid-cols-2 gap-1 rounded-full border border-line p-1">
        {(["subjects", "folders"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("focus-ring h-9 rounded-full text-sm font-medium", tab === t ? "bg-accent text-[#000000]" : "text-fg-2 hover:text-fg")}
          >
            {t === "subjects" ? "Subjects, courses & exams" : "Folders & collections"}
          </button>
        ))}
      </div>
      {error && <FormMessage className="mb-3">{error}</FormMessage>}

      {tab === "subjects" ? (
        <>
          <form
            className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              const kind = String(fd.get("kind")) as "subject" | "course" | "examination";
              run(() => createSubject({ name: String(fd.get("name")), kind, examDate: kind === "examination" ? String(fd.get("examDate") || "") || null : null }), () => form.reset());
            }}
          >
            <input name="name" required maxLength={120} placeholder="e.g. Computer Networks" className={inputCls} aria-label="Name" />
            <select name="kind" className={cn(inputCls, "[&>option]:bg-bg-2")} aria-label="Type">
              {SUBJECT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <input name="examDate" type="date" className={inputCls} aria-label="Exam date (optional, for exams)" />
            <Button type="submit" loading={pending} className="h-11"><Plus className="size-4" aria-hidden="true" /> Add</Button>
          </form>
          <List
            empty="No subjects yet."
            items={subjects.map((s) => ({
              id: s.id,
              name: s.name,
              meta: SUBJECT_KINDS.find((k) => k.value === s.kind)?.label + (s.exam_date ? ` · ${s.exam_date}` : ""),
              Icon: SUBJECT_KINDS.find((k) => k.value === s.kind)?.icon ?? BookMarked,
            }))}
            editing={editing}
            setEditing={setEditing}
            pending={pending}
            onRename={(id, name) => run(() => renameSubject(id, name), () => setEditing(null))}
            onDelete={(id) => run(() => deleteSubject(id))}
          />
        </>
      ) : (
        <>
          <form
            className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              run(() => createFolder({ name: String(fd.get("name")), kind: String(fd.get("kind")) as "folder" | "collection" }), () => form.reset());
            }}
          >
            <input name="name" required maxLength={120} placeholder="e.g. Semester 1" className={inputCls} aria-label="Name" />
            <select name="kind" className={cn(inputCls, "[&>option]:bg-bg-2")} aria-label="Type">
              <option value="folder">Folder</option>
              <option value="collection">Collection</option>
            </select>
            <Button type="submit" loading={pending} className="h-11"><Plus className="size-4" aria-hidden="true" /> Add</Button>
          </form>
          <List
            empty="No folders yet."
            items={folders.map((f) => ({ id: f.id, name: f.name, meta: f.kind === "collection" ? "Collection" : "Folder", Icon: f.kind === "collection" ? Layers : Folder }))}
            editing={editing}
            setEditing={setEditing}
            pending={pending}
            onRename={(id, name) => run(() => renameFolder(id, name), () => setEditing(null))}
            onDelete={(id) => run(() => deleteFolder(id))}
          />
        </>
      )}
      <p className="mt-4 text-xs text-muted">Deleting a subject or folder keeps its materials — they simply become unassigned.</p>
    </Dialog>
  );
}

function List({
  items,
  empty,
  editing,
  setEditing,
  onRename,
  onDelete,
  pending,
}: {
  items: { id: string; name: string; meta: string; Icon: React.ComponentType<{ className?: string }> }[];
  empty: string;
  editing: string | null;
  setEditing: (id: string | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  pending: boolean;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!items.length) return <p className="mt-4 text-sm text-fg-2">{empty}</p>;
  const icon = "focus-ring flex size-9 items-center justify-center rounded-full text-fg-2 hover:bg-white/5 hover:text-fg";
  return (
    <ul className="mt-4 max-h-72 space-y-1.5 overflow-y-auto">
      {items.map(({ id, name, meta, Icon }) => (
        <li key={id} className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.03] px-3 py-2">
          <Icon className="size-4 shrink-0 text-accent" aria-hidden="true" />
          {editing === id ? (
            <form
              className="flex flex-1 items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                onRename(id, String(new FormData(e.currentTarget).get("name")));
              }}
            >
              <input name="name" defaultValue={name} autoFocus maxLength={120} className={cn(inputCls, "h-9")} aria-label={`New name for ${name}`} />
              <button type="submit" className={icon} aria-label="Save name" disabled={pending}><Check className="size-4" /></button>
              <button type="button" className={icon} aria-label="Cancel rename" onClick={() => setEditing(null)}><X className="size-4" /></button>
            </form>
          ) : (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{name}</span>
                <span className="block text-xs text-fg-2">{meta}</span>
              </span>
              {confirm === id ? (
                <span className="flex items-center gap-1 text-xs">
                  Delete?
                  <button type="button" className="focus-ring rounded-full px-2 py-1 font-semibold text-error hover:bg-error/10" onClick={() => { onDelete(id); setConfirm(null); }}>Yes</button>
                  <button type="button" className="focus-ring rounded-full px-2 py-1 text-fg-2 hover:bg-white/5" onClick={() => setConfirm(null)}>No</button>
                </span>
              ) : (
                <>
                  <button type="button" className={icon} aria-label={`Rename ${name}`} onClick={() => setEditing(id)}><Pencil className="size-4" /></button>
                  <button type="button" className={icon} aria-label={`Delete ${name}`} onClick={() => setConfirm(id)}><Trash2 className="size-4" /></button>
                </>
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
