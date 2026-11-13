import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, Sparkles } from "lucide-react";
import { PlanActions } from "@/components/planner/plan-controls";
import { PlanTimeline } from "@/components/planner/plan-timeline";
import { RescheduleBanner } from "@/components/planner/reschedule-banner";
import { FormMessage } from "@/components/ui/feedback";
import { GlassCard } from "@/components/ui/glass-card";
import { ProgressBar } from "@/components/ui/progress";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { getPlan } from "@/lib/data/planner";
import { localDateISO, relativeDayLabel } from "@/lib/utils/dates";
import { formatMinutes } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Study plan" };

export default async function PlanPage({ params, searchParams }: PageProps<"/planner/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { user, profile } = await requireOnboardedUser();
  const [plan, sp] = await Promise.all([getPlan(user.id, id), searchParams]);
  if (!plan) notFound();
  const today = localDateISO(profile.timezone);

  const visible = plan.sessions.filter((s) => s.status !== "rescheduled" && s.status !== "missed");
  const tasks = visible.flatMap((s) => s.tasks);
  const done = tasks.filter((t) => t.status === "completed").length;
  const missed = plan.sessions.filter((s) => (s.status === "scheduled" || s.status === "in_progress") && s.scheduled_date < today && s.kind !== "assessment").length;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/planner" className="focus-ring inline-flex items-center gap-2 rounded-full text-sm text-fg-2 hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Study Planner
      </Link>
      {sp.created && <FormMessage tone="success">Your plan is ready. Tick off tasks as you finish them — that&apos;s what builds your streak.</FormMessage>}

      <GlassCard className="p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">{plan.status === "completed" ? "Completed plan" : plan.mode === "combined" ? "Combined plan" : "Individual plan"}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{plan.title}</h1>
        <p className="mt-1 text-sm text-fg-2">
          {plan.materials.map((m, i) => (
            <span key={m.id}>
              {i > 0 && " · "}
              <Link href={`/library/${m.id}`} className="hover:underline">{m.title}</Link>
            </span>
          ))}
        </p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-fg-2">
          <span>{relativeDayLabel(plan.start_date, today)} → {relativeDayLabel(plan.deadline, today)}</span>
          <span>{formatMinutes(plan.daily_minutes)} / day</span>
          <span className="capitalize">{plan.workload} workload</span>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <ProgressBar value={tasks.length ? (done / tasks.length) * 100 : 0} label="Plan progress" />
          <span className="shrink-0 text-sm font-semibold">{done}/{tasks.length}</span>
        </div>
        <div className="mt-5 border-t border-line pt-4">
          <PlanActions planId={plan.id} status={plan.status} />
        </div>
      </GlassCard>

      {plan.status === "active" && missed > 0 && <RescheduleBanner planId={plan.id} missed={missed} today={today} />}

      <PlanTimeline plan={plan} today={today} />
      {plan.sessions.some((s) => s.status === "missed" || s.status === "rescheduled") && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Sparkles className="size-3.5" aria-hidden="true" /> Sessions replaced by a reschedule are hidden; their tasks moved to the new days.
        </p>
      )}
    </div>
  );
}
