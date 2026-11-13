import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, Clock, ListChecks } from "lucide-react";
import { DeleteQuizButton, StartQuizButton } from "@/components/assessments/quiz-launchers";
import { FormMessage } from "@/components/ui/feedback";
import { GlassCard } from "@/components/ui/glass-card";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { TYPE_LABEL, type QuestionType } from "@/lib/assessments/questions";
import { createClient } from "@/lib/supabase/server";
import { cn, formatMinutes } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Quiz" };

export default async function QuizPage({ params }: PageProps<"/assessments/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { profile } = await requireOnboardedUser();
  const supabase = await createClient();
  const [{ data: quiz }, { data: attempts }, { data: types }] = await Promise.all([
    supabase.from("quizzes").select("id, title, kind, status, error, question_count, time_limit_seconds, session_id, created_at").eq("id", id).maybeSingle(),
    supabase.from("quiz_attempts").select("id, status, percent, score, max_score, started_at, submitted_at").eq("quiz_id", id).order("started_at", { ascending: false }),
    supabase.from("quiz_questions").select("type").eq("quiz_id", id),
  ]);
  if (!quiz) notFound();
  const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: profile.timezone });
  const inProgress = (attempts ?? []).find((a) => a.status === "in_progress");
  const graded = (attempts ?? []).filter((a) => a.status === "graded");
  const typeCounts = new Map<QuestionType, number>();
  for (const t of (types ?? []) as { type: QuestionType }[]) typeCounts.set(t.type, (typeCounts.get(t.type) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={quiz.session_id ? `/planner/sessions/${quiz.session_id}` : "/assessments"} className="focus-ring inline-flex items-center gap-2 rounded-full text-sm text-fg-2 hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Back
      </Link>
      <GlassCard className="p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">{quiz.kind === "daily" ? "Daily quiz" : quiz.kind === "mock" ? "Mock exam" : "Practice quiz"}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{quiz.title}</h1>
        {quiz.status === "ready" && (
          <>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-fg-2">
              <span className="flex items-center gap-1.5"><ListChecks className="size-4" aria-hidden="true" /> {quiz.question_count} questions</span>
              <span className="flex items-center gap-1.5"><Clock className="size-4" aria-hidden="true" /> {quiz.time_limit_seconds ? formatMinutes(Math.round(quiz.time_limit_seconds / 60)) : "Untimed"}</span>
            </div>
            <p className="mt-2 text-xs text-muted">{[...typeCounts.entries()].map(([t, n]) => `${n} ${TYPE_LABEL[t].toLowerCase()}`).join(" · ")}</p>
            <div className="mt-6">
              <StartQuizButton quizId={quiz.id} resume={Boolean(inProgress)} label={inProgress ? "Resume quiz" : graded.length ? "Retry quiz" : "Start quiz"} />
            </div>
          </>
        )}
        {quiz.status === "generating" && <FormMessage tone="info" className="mt-4">This quiz is still being generated. Refresh in a moment.</FormMessage>}
        {quiz.status === "failed" && (
          <FormMessage className="mt-4">{quiz.error ?? "Quiz generation failed."} {quiz.session_id ? "Go back to the session to try again." : "Generate a new quiz from Assessments."}</FormMessage>
        )}
      </GlassCard>

      {graded.length > 0 && (
        <GlassCard className="p-5">
          <h2 className="font-semibold">Attempt history</h2>
          <ul className="mt-3 space-y-2">
            {graded.map((a) => (
              <li key={a.id}>
                <Link href={`/assessments/attempts/${a.id}`} className="focus-ring flex items-center justify-between rounded-xl border border-line bg-white/[0.03] px-4 py-3 text-sm hover:border-accent/40">
                  <span className="text-fg-2">{fmt.format(new Date(a.submitted_at ?? a.started_at))}</span>
                  <span className={cn("font-semibold", Number(a.percent) >= 80 ? "text-accent" : Number(a.percent) >= 60 ? "text-warning" : "text-error")}>
                    {Number(a.score)}/{Number(a.max_score)} · {Math.round(Number(a.percent))}%
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}
      {quiz.kind !== "daily" && <DeleteQuizButton quizId={quiz.id} />}
    </div>
  );
}
