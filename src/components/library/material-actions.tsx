"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FolderInput, Pencil, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { deleteMaterials, moveMaterials, retryProcessing, updateMaterial } from "@/app/(app)/library/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/input";
import type { FolderOption, SubjectOption } from "@/lib/data/library";
import { UploadPanel } from "./upload-panel";

export function MaterialActions({
  material,
  subjects,
  folders,
  maxBytes,
}: {
  material: { id: string; title: string; status: string; subjectId: string | null; folderId: string | null };
  subjects: SubjectOption[];
  folders: FolderOption[];
  maxBytes: number;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"rename" | "move" | "replace" | "delete" | null>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(undefined);
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        setDialog(null);
        after?.();
        router.refresh();
      }
    });
  const canReplace = material.status === "ready" || material.status === "failed";
  const select = "glass h-12 w-full rounded-xl px-3 text-fg outline-none [&>option]:bg-bg-2";

  return (
    <div className="mt-5 border-t border-line pt-4">
      {error && <FormMessage className="mb-3">{error}</FormMessage>}
      <div className="flex flex-wrap gap-2">
        {material.status === "failed" && (
          <Button size="sm" onClick={() => run(() => retryProcessing(material.id))} loading={pending && !dialog}>
            <RotateCcw className="size-4" aria-hidden="true" /> Retry processing
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => setDialog("rename")}><Pencil className="size-4" aria-hidden="true" /> Rename</Button>
        <Button size="sm" variant="secondary" onClick={() => setDialog("move")}><FolderInput className="size-4" aria-hidden="true" /> Organise</Button>
        {canReplace && <Button size="sm" variant="secondary" onClick={() => setDialog("replace")}><RefreshCw className="size-4" aria-hidden="true" /> Replace file</Button>}
        <Button size="sm" variant="secondary" onClick={() => setDialog("delete")}><Trash2 className="size-4 text-error" aria-hidden="true" /> Delete</Button>
      </div>

      <Dialog open={dialog === "rename"} onClose={() => setDialog(null)} title="Rename material">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const t = String(new FormData(e.currentTarget).get("title") ?? "").trim(); if (t) run(() => updateMaterial({ id: material.id, title: t })); }}>
          <TextField label="Title" name="title" defaultValue={material.title} maxLength={300} required autoFocus />
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" loading={pending}>Save</Button></div>
        </form>
      </Dialog>

      <Dialog open={dialog === "move"} onClose={() => setDialog(null)} title="Organise material">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => moveMaterials({ ids: [material.id], subjectId: String(fd.get("subject") || "") || null, folderId: String(fd.get("folder") || "") || null })); }}>
          <label className="block space-y-1.5 text-sm"><span className="text-fg-2">Subject / course / exam</span>
            <select name="subject" defaultValue={material.subjectId ?? ""} className={select}><option value="">None</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </label>
          <label className="block space-y-1.5 text-sm"><span className="text-fg-2">Folder / collection</span>
            <select name="folder" defaultValue={material.folderId ?? ""} className={select}><option value="">None</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
          </label>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" loading={pending}>Save</Button></div>
        </form>
      </Dialog>

      <Dialog open={dialog === "replace"} onClose={() => setDialog(null)} title="Replace file" description="Upload a new version. Sections are rebuilt; your reading progress is kept.">
        {dialog === "replace" && (
          <UploadPanel maxBytes={maxBytes} subjects={[]} folders={[]} replaceMaterialId={material.id} onDone={() => { setDialog(null); router.refresh(); }} />
        )}
      </Dialog>

      <ConfirmDialog
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        destructive
        busy={pending}
        title="Delete this material?"
        description="The original file, extracted text, notes and highlights will be permanently deleted."
        confirmLabel="Delete permanently"
        onConfirm={() => run(() => deleteMaterials([material.id]), () => router.push("/library"))}
      />
    </div>
  );
}
