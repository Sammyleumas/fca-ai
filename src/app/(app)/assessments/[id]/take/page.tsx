import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { QuizRunner, type RunnerQuestion } from "@/components/assessments/quiz-runner";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Quiz" };
// Submitting may include AI marking of written answers.
export const maxDuration = 120;

export default async function TakeQuizPage({ params, searchParams }: PageProps<"/assessments/[id]/take">) {
  const { id } = await params;
  const sp = await searchParams;
  const attemptId = typeof sp.attempt === "string" ? sp.attempt : "";
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(attemptId).success) notFound();
  await requireOnboardedUser();
  const supabase = await createClient();
  const [{ data: quiz }, { data: attempt }, { data: questions }] = await Promise.all([
    supabase.from("quizzes").select("id, title, status, time_limit_seconds").eq("id", id).maybeSingle(),
    supabase.from("quiz_attempts").select("id, status, started_at, quiz_id").eq("id", attemptId).maybeSingle(),
    // Safe columns only: correct answers are not even readable by the student's role.
    supabase.from("quiz_questions").select("id, position, type, prompt, options, points").eq("quiz_id", id).order("position"),
  ]);
  if (!quiz || !attempt || attempt.quiz_id !== id) notFound();
  if (attempt.status !== "in_progress") redirect(`/assessments/attempts/${attemptId}`);
  return (
    <QuizRunner
      title={quiz.title}
      attemptId={attempt.id}
      startedAt={attempt.started_at}
      timeLimitSeconds={quiz.time_limit_seconds}
      questions={((questions ?? []) as RunnerQuestion[]).map((q) => ({ ...q, points: Number(q.points) }))}
    />
  );
}
