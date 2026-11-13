import Link from "next/link";
import { CheckCircle2, CircleDashed, ClipboardCheck, RefreshCcw } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import type { PlanDetail, PlanSession } from "@/lib/data/planner";
import { relativeDayLabel } from "@/lib/utils/dates";
import { cn, formatMinutes } from "@/lib/utils/format";
import { MoveSessionButton } from "./plan-controls";
import { TaskRow } from "./task-row";

const KIND_ICON = { study: CircleDashed, revision: RefreshCcw, assessment: ClipboardCheck } as const;

/** Day-by-day schedule of a plan, with task check-offs and session moves. */
export function PlanTimeline({ plan, today }: { plan: PlanDetail; today: string }) {
  const visible = plan.sessions.filter((s) => s.status !== "rescheduled" && s.status !== "missed");
  const byDate = new Map<string, PlanSession[]>();
  for (const s of visible) byDate.set(s.scheduled_date, [...(byDate.get(s.scheduled_date) ?? []), s]);
  const days = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  const studyDayIndex = new Map(days.filter(([, ss]) => ss.some((s) => s.kind !== "assessment")).map(([d], i) => [d, i + 1]));
  const firstOpen = days.find(([d, ss]) => d >= today && ss.some((s) => s.status !== "completed"))?.[0];

  return (
    <ol className="space-y-3" aria-label="Schedule">
      {days.map(([date, sessions]) => {
        const allDone = sessions.every((s) => s.status === "completed" || (s.kind === "assessment" && date < today));
        const n = studyDayIndex.get(date);
        return (
          <li key={date} id={date === firstOpen ? "next" : undefined}>
            <GlassCard className={cn("p-4 sm:p-5", date === today && "border-accent/50", date < today && allDone && "opacity-80")}>
              <div className="mb-3 flex items-center gap-3">
                {allDone && sessions.some((s) => s.kind !== "assessment") ? (
                  <CheckCircle2 className="size-6 text-accent" aria-label="Completed" />
                ) : (
                  <span className={cn("size-6 rounded-full border-2", date === today ? "border-accent shadow-[0_0_10px_rgba(214,255,53,0.6)]" : "border-line-strong")} aria-hidden="true" />
                )}
                <p className="font-semibold">
                  {n ? `Day ${n}` : "Quiz"} <span className="font-normal text-fg-2">· {relativeDayLabel(date, today)}</span>
                </p>
              </div>
              <div className="space-y-3">
                {sessions.map((s) => {
                  const Icon = KIND_ICON[s.kind];
                  const open = s.status === "scheduled" || s.status === "in_progress";
                  return (
                    <div key={s.id}>
                      <div className="flex items-center gap-2">
                        <Icon className="size-4 shrink-0 text-accent" aria-hidden="true" />
                        <Link href={`/planner/sessions/${s.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">{s.title}</Link>
                        <span className="shrink-0 text-xs text-fg-2">{formatMinutes(s.planned_minutes)}</span>
                        {open && s.kind !== "assessment" && plan.status === "active" && <MoveSessionButton sessionId={s.id} date={s.scheduled_date} today={today} />}
                      </div>
                      {s.kind === "assessment" ? (
                        <p className="ml-6 mt-1 text-xs text-muted">AI quizzes on the day&apos;s topics arrive in the assessment phase.</p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {s.tasks.map((t) => (
                            <TaskRow key={t.id} task={t} readHref={t.material_id ? `/library/${t.material_id}` : undefined} disabled={plan.status !== "active"} />
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          </li>
        );
      })}
    </ol>
  );
}
