"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, CalendarDays, RotateCcw, Trash2 } from "lucide-react";
import { deletePlan, moveSession, setPlanStatus } from "@/app/(app)/planner/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/feedback";

export function MoveSessionButton({ sessionId, date, today }: { sessionId: string; date: string; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring flex size-9 items-center justify-center rounded-full text-fg-2 hover:bg-white/5 hover:text-fg"
        aria-label="Move this session to another day"
      >
        <CalendarDays className="size-4" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Move session" description="Pick a new day for this session.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const d = String(new FormData(e.currentTarget).get("date"));
            start(async () => {
              const r = await moveSession(sessionId, d);
              if (!r.ok) setError(r.error);
              else {
                setNote(r.warning);
                if (!r.warning) setOpen(false);
                router.refresh();
              }
            });
          }}
        >
          <input type="date" name="date" min={today} defaultValue={date < today ? today : date} required className="glass h-12 w-full rounded-xl px-3 text-fg outline-none" />
          {error && <FormMessage>{error}</FormMessage>}
          {note && <FormMessage tone="info">{note}</FormMessage>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{note ? "Close" : "Cancel"}</Button>
            {!note && <Button type="submit" loading={pending}>Move</Button>}
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function PlanActions({ planId, status }: { planId: string; status: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      {error && <FormMessage className="w-full">{error}</FormMessage>}
      {status === "active" ? (
        <Button size="sm" variant="secondary" loading={pending && !confirm} onClick={() => start(async () => { const r = await setPlanStatus(planId, "archived"); if (!r.ok) setError(r.error); else router.push("/planner"); })}>
          <Archive className="size-4" aria-hidden="true" /> Archive
        </Button>
      ) : status === "archived" ? (
        <Button size="sm" variant="secondary" loading={pending && !confirm} onClick={() => start(async () => { const r = await setPlanStatus(planId, "active"); if (!r.ok) setError(r.error); else router.refresh(); })}>
          <RotateCcw className="size-4" aria-hidden="true" /> Restore
        </Button>
      ) : null}
      <Button size="sm" variant="secondary" onClick={() => setConfirm(true)}>
        <Trash2 className="size-4 text-error" aria-hidden="true" /> Delete
      </Button>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        destructive
        busy={pending}
        title="Delete this plan?"
        description="Its sessions and tasks are removed. Your materials, reading progress and streak are kept."
        confirmLabel="Delete plan"
        onConfirm={() => start(async () => { const r = await deletePlan(planId); if (r && !r.ok) setError(r.error); })}
      />
    </div>
  );
}
