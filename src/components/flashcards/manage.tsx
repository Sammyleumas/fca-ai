"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EyeOff, Eye, Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { deleteCard, saveCard, setCardSuspended } from "@/app/(app)/flashcards/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/feedback";
import { cn } from "@/lib/utils/format";

const field = "w-full rounded-xl border border-line bg-white/[0.04] p-3 text-sm outline-none focus:border-accent/60";

export function GenerateCards({ materials }: { materials: { id: string; title: string }[] }) {
  const router = useRouter();
  const [materialId, setMaterialId] = useState(materials[0]?.id ?? "");
  const [count, setCount] = useState(15);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string }>();
  const [pending, start] = useTransition();
  if (!materials.length) return <p className="text-sm text-fg-2">Upload a material to generate flashcards from it.</p>;
  return (
    <div className="space-y-3">
      <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className="glass h-11 w-full rounded-xl px-3 text-sm outline-none [&>option]:bg-bg-2" aria-label="Material">
        {materials.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
      </select>
      <div className="flex gap-2">
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="glass h-11 rounded-xl px-3 text-sm outline-none [&>option]:bg-bg-2" aria-label="Number of cards">
          {[10, 15, 20, 30].map((n) => <option key={n} value={n}>{n} cards</option>)}
        </select>
        <Button
          className="flex-1"
          loading={pending}
          onClick={() =>
            start(async () => {
              setMsg(undefined);
              const res = await fetch("/api/flashcards/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ materialId, count }) });
              const d = (await res.json().catch(() => ({}))) as { created?: number; error?: string };
              if (d.created) {
                setMsg({ tone: "success", text: `${d.created} cards created from your material.` });
                router.refresh();
              } else setMsg({ tone: "error", text: d.error ?? "Something went wrong." });
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />} Generate
        </Button>
      </div>
      {msg && <FormMessage tone={msg.tone}>{msg.text}</FormMessage>}
    </div>
  );
}

export type ListCard = { id: string; front: string; back: string; explanation: string | null; suspended: boolean; due_at: string; interval_days: number; materialTitle: string | null; origin: string };

export function CardList({ cards, materials }: { cards: ListCard[]; materials: { id: string; title: string }[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Partial<ListCard> & { materialId?: string | null } | null>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const query = q.trim().toLowerCase();
  const shown = cards.filter((c) => !query || c.front.toLowerCase().includes(query) || c.back.toLowerCase().includes(query)).slice(0, 200);
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
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cards…" aria-label="Search cards" className="glass h-11 min-w-0 flex-1 rounded-full px-4 text-sm outline-none" />
        <Button onClick={() => setEdit({ materialId: materials[0]?.id ?? null })}><Plus className="size-4" aria-hidden="true" /> Card</Button>
      </div>
      {error && <FormMessage>{error}</FormMessage>}
      <ul className="space-y-2">
        {shown.map((c) => (
          <li key={c.id} className={cn("rounded-2xl border border-line bg-white/[0.03] p-3", c.suspended && "opacity-60")}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.front}</p>
                <p className="mt-0.5 text-sm text-fg-2">{c.back}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {[c.materialTitle, c.origin === "quiz_mistake" ? "from a quiz mistake" : c.origin === "manual" ? "your card" : "AI-generated", c.suspended ? "paused" : c.interval_days ? `next in ${c.interval_days}d` : "new"].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0">
                <button type="button" onClick={() => setEdit(c)} className="focus-ring rounded-full p-2 text-fg-2 hover:text-fg" aria-label="Edit card"><Pencil className="size-4" /></button>
                <button type="button" onClick={() => run(() => setCardSuspended(c.id, !c.suspended))} className="focus-ring rounded-full p-2 text-fg-2 hover:text-fg" aria-label={c.suspended ? "Resume card" : "Pause card"}>
                  {c.suspended ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </button>
                <button type="button" onClick={() => run(() => deleteCard(c.id))} className="focus-ring rounded-full p-2 text-fg-2 hover:text-error" aria-label="Delete card"><Trash2 className="size-4" /></button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? "Edit card" : "New card"}>
        {edit && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              run(
                () => saveCard({ id: edit.id, materialId: (fd.get("material") as string) || null, front: String(fd.get("front")), back: String(fd.get("back")), explanation: String(fd.get("explanation") ?? "") }),
                () => setEdit(null),
              );
            }}
          >
            {!edit.id && materials.length > 0 && (
              <select name="material" defaultValue={edit.materialId ?? ""} className="glass h-11 w-full rounded-xl px-3 text-sm outline-none [&>option]:bg-bg-2" aria-label="Material">
                <option value="">No material</option>
                {materials.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            )}
            <textarea name="front" defaultValue={edit.front} required maxLength={2000} rows={2} placeholder="Question or term" aria-label="Question or term" className={field} />
            <textarea name="back" defaultValue={edit.back} required maxLength={4000} rows={3} placeholder="Answer" aria-label="Answer" className={field} />
            <textarea name="explanation" defaultValue={edit.explanation ?? ""} maxLength={4000} rows={2} placeholder="Explanation (optional)" aria-label="Explanation" className={field} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
              <Button type="submit" loading={pending}>Save</Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
