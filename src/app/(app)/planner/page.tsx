import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarDays, Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, FormMessage } from "@/components/ui/feedback";
import { GlassCard } from "@/components/ui/glass-card";
import { ProgressRing } from "@/components/ui/progress";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { listPlans } from "@/lib/data/planner";
import { localDateISO, relativeDayLabel } from "@/lib/utils/dates";

export const metadata: Metadata = { title: "Study Planner" };

export default async function PlannerPage({ searchParams }: PageProps<"/planner">) {
  const { user, profile } = await requireOnboardedUser();
  const today = localDateISO(profile.timezone);
  const [plans, sp] = await Promise.all([listPlans(user.id, today), searchParams]);
  const active = plans.filter((p) => p.status === "active");
  const done = plans.filter((p) => p.status === "completed");
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Study Planner</h1>
          <p className="mt-1 text-sm text-fg-2">Your personalised study plans, built from your materials.</p>
        </div>
        <ButtonLink href="/planner/new"><Plus className="size-4" aria-hidden="true" /> New plan</ButtonLink>
      </div>
      {sp.deleted && <FormMessage tone="success">Plan deleted.</FormMessage>}
      {!active.length && !done.length ? (
        <GlassCard>
          <EmptyState
            icon={<CalendarDays className="size-6" />}
            title="No study plans yet"
            description="Pick one material for an individual plan, or several for one combined timetable. MindFlow schedules every section around your deadline and daily time."
            action={<ButtonLink href="/planner/new" size="sm">Create your first plan</ButtonLink>}
          />
        </GlassCard>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {[...active, ...done].map((p) => {
            const pct = p.totalTasks ? (p.doneTasks / p.totalTasks) * 100 : 0;
            return (
              <li key={p.id}>
                <Link href={`/planner/${p.id}`} className="focus-ring block rounded-[var(--radius-glass)]">
                  <GlassCard className="flex h-full gap-4 p-5 transition hover:border-accent/40">
                    <ProgressRing value={pct} size={68} label={`${Math.round(pct)}% of tasks done`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                        {p.status === "completed" ? "Completed" : p.mode === "combined" ? "Combined" : "Individual"}
                      </p>
                      <h2 className="truncate font-semibold">{p.title}</h2>
                      <p className="truncate text-xs text-fg-2">{p.materials.join(" · ")}</p>
                      <p className="mt-2 text-xs text-fg-2">
                        {p.doneTasks}/{p.totalTasks} tasks · deadline {relativeDayLabel(p.deadline, today)}
                      </p>
                      {p.missedSessions > 0 ? (
                        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-warning">
                          <AlertTriangle className="size-3.5" aria-hidden="true" /> {p.missedSessions} missed — review schedule
                        </p>
                      ) : p.nextSession ? (
                        <p className="mt-1 text-xs text-fg">Next: {p.nextSession.title} · {relativeDayLabel(p.nextSession.date, today)}</p>
                      ) : null}
                    </div>
                  </GlassCard>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
