import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ClipboardCheck, Loader2, Trophy } from "lucide-react";
import { NewQuizForm } from "@/components/assessments/quiz-launchers";
import { EmptyState, FormMessage } from "@/components/ui/feedback";
import { CardHeader, GlassCard } from "@/components/ui/glass-card";
import { isAIConfigured } from "@/lib/ai";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { getQuizSources, listQuizzes } from "@/lib/data/assessments";
import { cn } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Assessments" };
export const maxDuration = 120;

export default async function AssessmentsPage({ searchParams }: PageProps<"/assessments">) {
  const { user, profile } = await requireOnboardedUser();
  const [sp, quizzes, sources] = await Promise.all([searchParams, listQuizzes(user.id), getQuizSources(user.id)]);
  const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: profile.timezone });
  const graded = quizzes.flatMap((q) => q.attempts.filter((a) => a.percent !== null));
  const avg = graded.length ? Math.round(graded.reduce((n, a) => n + Number(a.percent), 0) / graded.length) : null;

  return (
    <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
      <div className="space-y-5">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Quiz &amp; Assessment</h1>
          <p className="mt-1 text-sm text-fg-2">
            {graded.length ? `${graded.length} attempt${graded.length === 1 ? "" : "s"} · average ${avg}%` : "Test your understanding with questions built from your own materials."}
          </p>
        </div>
        {quizzes.length ? (
          <ul className="space-y-2.5">
            {quizzes.map((q) => {
              const done = q.attempts.filter((a) => a.percent !== null).sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""));
              const best = done.length ? Math.max(...done.map((a) => Number(a.percent))) : null;
              return (
                <li key={q.id}>
                  <Link href={`/assessments/${q.id}`} className="focus-ring block rounded-[var(--radius-glass)]">
                    <GlassCard className="flex items-center gap-4 p-4 transition hover:border-accent/40">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                        {q.kind === "mock" ? <Trophy className="size-5" aria-hidden="true" /> : <ClipboardCheck className="size-5" aria-hidden="true" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{q.title}</p>
                        <p className="text-xs text-fg-2">
                          {fmt.format(new Date(q.created_at))} · {q.kind === "daily" ? "Daily quiz" : q.kind === "mock" ? "Mock exam" : "Practice"}
                          {q.status === "ready" ? ` · ${q.question_count} questions` : ""}
                          {done.length ? ` · ${done.length} attempt${done.length === 1 ? "" : "s"}` : ""}
                        </p>
                      </div>
                      {q.status === "generating" ? (
                        <Loader2 className="size-5 animate-spin text-accent" aria-label="Generating" />
                      ) : q.status === "failed" ? (
                        <AlertTriangle className="size-5 text-error" aria-label="Failed" />
                      ) : best !== null ? (
                        <span className={cn("text-lg font-semibold", best >= 80 ? "text-accent" : best >= 60 ? "text-warning" : "text-error")}>{Math.round(best)}%</span>
                      ) : (
                        <span className="text-xs text-fg-2">Not taken</span>
                      )}
                    </GlassCard>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <GlassCard>
            <EmptyState icon={<ClipboardCheck className="size-6" />} title="No quizzes yet" description="Generate a practice quiz or mock exam, or take the daily quiz in your study plan." />
          </GlassCard>
        )}
      </div>
      <GlassCard className="p-5 lg:sticky lg:top-24">
        <CardHeader title="New quiz" />
        <div className="mt-4">
          {isAIConfigured() ? (
            <NewQuizForm materials={sources.materials} plans={sources.plans} defaultMock={sp.mock === "1"} />
          ) : (
            <FormMessage tone="info">AI quizzes aren&apos;t configured on this server yet (missing GEMINI_API_KEY).</FormMessage>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
