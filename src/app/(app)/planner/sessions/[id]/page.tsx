import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, BotMessageSquare, Target } from "lucide-react";
import { TaskRow } from "@/components/planner/task-row";
import { FormMessage } from "@/components/ui/feedback";
import { CardHeader, GlassCard } from "@/components/ui/glass-card";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { getPlan } from "@/lib/data/planner";
import { createClient } from "@/lib/supabase/server";
import { localDateISO, relativeDayLabel } from "@/lib/utils/dates";
import { formatMinutes } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Study session" };

export default async function SessionPage({ params }: PageProps<"/planner/sessions/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { user, profile } = await requireOnboardedUser();
  const supabase = await createClient();
  const { data: row } = await supabase.from("study_sessions").select("plan_id").eq("id", id).maybeSingle();
  if (!row) notFound();
  const plan = await getPlan(user.id, row.plan_id as string);
  const session = plan?.sessions.find((s) => s.id === id);
  if (!plan || !session) notFound();
  const today = localDateISO(profile.timezone);
  const first = session.tasks.find((t) => t.status !== "completed" && t.material_id);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={`/planner/${plan.id}`} className="focus-ring inline-flex items-center gap-2 rounded-full text-sm text-fg-2 hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> {plan.title}
      </Link>
      <GlassCard className="p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          {session.kind === "study" ? "Study session" : session.kind === "revision" ? "Revision session" : "Assessment"} · {relativeDayLabel(session.scheduled_date, today)}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{session.title}</h1>
        <p className="mt-1 text-sm text-fg-2">{formatMinutes(session.planned_minutes)} planned · {session.status.replace("_", " ")}</p>
      </GlassCard>

      {(session.status === "missed" || session.status === "rescheduled") && (
        <FormMessage tone="info">This session was replaced when your plan was rescheduled. Its unfinished tasks moved to new days.</FormMessage>
      )}

      {session.objectives.length > 0 && (
        <GlassCard className="p-5">
          <CardHeader icon={<Target className="size-5" />} title="Learning objectives" />
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-fg-2">
            {session.objectives.map((o) => <li key={o}>{o}</li>)}
          </ul>
        </GlassCard>
      )}

      {session.kind === "assessment" ? (
        <FormMessage tone="info">AI-generated quizzes on this day&apos;s topics arrive in the assessment build phase.</FormMessage>
      ) : (
        <GlassCard className="p-5">
          <CardHeader title="Tasks" />
          <ul className="mt-3 space-y-2">
            {session.tasks.map((t) => (
              <TaskRow key={t.id} task={t} readHref={t.material_id ? `/library/${t.material_id}` : undefined} disabled={plan.status !== "active" || session.status === "rescheduled"} />
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">The full Reading Room arrives in the next phase; for now the read button opens the material with its preview.</p>
        </GlassCard>
      )}

      {first && (
        <Link
          href={`/tutor?material=${first.material_id}${first.section_id ? `&section=${first.section_id}` : ""}`}
          className="focus-ring glass flex items-center gap-3 rounded-2xl p-4 hover:border-accent/40"
        >
          <BotMessageSquare className="size-6 text-accent" aria-hidden="true" />
          <span className="flex-1 text-sm">
            <span className="block font-semibold">Stuck on something?</span>
            <span className="text-fg-2">Ask the AI tutor about “{first.title}” — answers come from your material with page references.</span>
          </span>
        </Link>
      )}
    </div>
  );
}
