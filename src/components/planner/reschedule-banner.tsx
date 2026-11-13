"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { applyReschedule, getRescheduleProposal } from "@/app/(app)/planner/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/feedback";
import type { RescheduleProposal } from "@/lib/planner/scheduler";
import { relativeDayLabel } from "@/lib/utils/dates";
import { formatMinutes } from "@/lib/utils/format";

/** Shows missed sessions and lets the student review — then approve — a new schedule. */
export function RescheduleBanner({ planId, missed, today }: { planId: string; missed: number; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [proposal, setProposal] = useState<{ proposal: RescheduleProposal; version: number } | null>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const review = () =>
    start(async () => {
      setError(undefined);
      const r = await getRescheduleProposal(planId);
      if (!r.ok) setError(r.error);
      else {
        setProposal({ proposal: r.proposal, version: r.version });
        setOpen(true);
      }
    });
  const apply = () =>
    start(async () => {
      const r = await applyReschedule(planId, proposal!.version);
      if (!r.ok) setError(r.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4">
        <AlertTriangle className="size-5 shrink-0 text-warning" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm">
          You have {missed} missed session{missed === 1 ? "" : "s"}. MindFlow can rearrange your unfinished work so the plan stays realistic.
        </p>
        <Button size="sm" onClick={review} loading={pending && !open}>
          <CalendarClock className="size-4" aria-hidden="true" /> Review new schedule
        </Button>
      </div>
      {error && !open && <FormMessage>{error}</FormMessage>}
      <Dialog open={open} onClose={() => setOpen(false)} title="Proposed schedule" description="Nothing changes until you approve. Completed work stays as it is." className="max-w-xl">
        {proposal && (
          <div className="space-y-4">
            <FormMessage tone={proposal.proposal.deadlineExtended ? "error" : "info"}>{proposal.proposal.summary}</FormMessage>
            <ol className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {proposal.proposal.sessions
                .filter((s) => s.kind !== "assessment")
                .map((s) => (
                  <li key={`${s.date}-${s.taskIds[0]}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{s.title}</span>
                      <span className="block text-xs text-fg-2">{s.taskIds.length} task{s.taskIds.length === 1 ? "" : "s"} · {formatMinutes(s.minutes)}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-accent">{relativeDayLabel(s.date, today)}</span>
                  </li>
                ))}
            </ol>
            {error && <FormMessage>{error}</FormMessage>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Keep my current plan</Button>
              <Button onClick={apply} loading={pending}>Apply new schedule</Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
