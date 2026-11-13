"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { gradeObjective, summariseAttempt } from "@/lib/assessments/grading";
import type { CorrectAnswer, QuestionType, StudentAnswer } from "@/lib/assessments/questions";
import { gradeOpenAnswers } from "@/lib/assessments/service";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const uuid = z.uuid();

/** Starts (or resumes) an attempt. Attempts are written by the server, never by the client. */
export async function startAttempt(quizId: string): Promise<Result<{ attemptId: string; startedAt: string }>> {
  const user = await requireUser();
  if (!uuid.safeParse(quizId).success) return { ok: false, error: "Invalid request." };
  if (!hasAdminClient()) return { ok: false, error: "Assessments aren't configured on this server yet." };
  const supabase = await createClient();
  const { data: quiz } = await supabase.from("quizzes").select("id, status").eq("id", quizId).maybeSingle();
  if (!quiz || quiz.status !== "ready") return { ok: false, error: "This quiz isn't ready." };
  const { data: open } = await supabase
    .from("quiz_attempts")
    .select("id, started_at")
    .eq("quiz_id", quizId)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open) return { ok: true, attemptId: open.id as string, startedAt: open.started_at as string };
  const { data, error } = await createAdminClient()
    .from("quiz_attempts")
    .insert({ quiz_id: quizId, user_id: user.id, status: "in_progress" })
    .select("id, started_at")
    .single();
  if (error || !data) return { ok: false, error: "Could not start the quiz." };
  return { ok: true, attemptId: data.id as string, startedAt: data.started_at as string };
}

const answerSchema = z
  .object({ option: z.number().int().min(0).max(9).optional(), value: z.boolean().optional(), text: z.string().max(6000).optional() })
  .nullable();
const submitSchema = z.object({ attemptId: uuid, answers: z.record(z.string(), answerSchema) });

/** Grades an attempt on the server and records the result. */
export async function submitAttempt(input: z.input<typeof submitSchema>): Promise<Result<{ attemptId: string }>> {
  const user = await requireUser();
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid answers." };
  const { attemptId, answers } = parsed.data;
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: attempt } = await supabase
    .from("quiz_attempts")
    .select("id, quiz_id, status, started_at, quizzes(id, title, kind, time_limit_seconds, session_id)")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt) return { ok: false, error: "Attempt not found." };
  if (attempt.status !== "in_progress") return { ok: true, attemptId }; // already submitted (double click)
  const quiz = (Array.isArray(attempt.quizzes) ? attempt.quizzes[0] : attempt.quizzes) as {
    id: string; title: string; kind: string; time_limit_seconds: number | null; session_id: string | null;
  };

  // Claim the attempt so a second submit can't grade twice.
  const { data: claimed } = await admin
    .from("quiz_attempts")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", attemptId)
    .eq("status", "in_progress")
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: true, attemptId };

  const { data: qs } = await admin
    .from("quiz_questions")
    .select("id, position, type, prompt, options, correct_answer, explanation, topic, section_id, source_material_id, source_page, points")
    .eq("quiz_id", quiz.id)
    .eq("user_id", user.id)
    .order("position");
  const questions = (qs ?? []) as {
    id: string; position: number; type: QuestionType; prompt: string; options: string[]; correct_answer: CorrectAnswer;
    explanation: string | null; topic: string | null; section_id: string | null; source_material_id: string | null; source_page: number | null; points: number;
  }[];

  const open = questions
    .filter((q) => q.type === "short_answer" || q.type === "theory")
    .map((q) => {
      const c = q.correct_answer as { model_answer: string; key_points: string[] };
      return { index: q.position, prompt: q.prompt, modelAnswer: c.model_answer, keyPoints: c.key_points, answer: (answers[q.id] as StudentAnswer)?.text ?? "" };
    });
  const openGrades = await gradeOpenAnswers(user.id, open);

  const rows = questions.map((q) => {
    const a = (answers[q.id] ?? null) as StudentAnswer;
    const pts = Number(q.points);
    const obj = gradeObjective(q.type, q.correct_answer, a, pts);
    if (obj) return { q, a, awarded: obj.points, isCorrect: obj.isCorrect, feedback: null as string | null };
    const g = openGrades.get(q.position);
    if (!g) return { q, a, awarded: null as number | null, isCorrect: null as boolean | null, feedback: "This answer couldn't be marked automatically right now." };
    return { q, a, awarded: Math.round(g.fraction * pts * 2) / 2, isCorrect: g.fraction >= 0.75, feedback: g.feedback };
  });

  await admin.from("quiz_answers").insert(
    rows.map((r) => ({ attempt_id: attemptId, question_id: r.q.id, user_id: user.id, answer: r.a, is_correct: r.isCorrect, points_awarded: r.awarded, feedback: r.feedback })),
  );

  const summary = summariseAttempt(rows.map((r) => ({ topic: r.q.topic, section_id: r.q.section_id, points: Number(r.q.points), awarded: r.awarded })));
  const elapsed = (Date.now() - new Date(attempt.started_at as string).getTime()) / 1000;
  const late = quiz.time_limit_seconds ? elapsed > quiz.time_limit_seconds + 60 : false;
  await admin
    .from("quiz_attempts")
    .update({
      status: "graded",
      graded_at: new Date().toISOString(),
      score: summary.score,
      max_score: summary.maxScore,
      percent: summary.percent,
      ungraded_count: summary.ungraded,
      feedback: { topics: summary.topics, mastered: summary.mastered, needs_revision: summary.needsRevision, correct: summary.correct, incorrect: summary.incorrect, late, elapsed_seconds: Math.round(elapsed) },
    })
    .eq("id", attemptId);

  // Streaks / XP / achievements (verified: the attempt is now graded).
  await supabase.rpc("record_study_activity", { p_kind: "quiz_completed", p_minutes: Math.min(240, Math.round(elapsed / 60)), p_reference_id: attemptId });

  // A daily quiz completes its assessment session.
  if (quiz.session_id) {
    const { data: done } = await supabase
      .from("study_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", quiz.session_id)
      .neq("status", "completed")
      .select("id")
      .maybeSingle();
    if (done) await supabase.rpc("record_study_activity", { p_kind: "session_completed", p_reference_id: quiz.session_id });
  }

  // Mistakes become flashcards for spaced revision.
  const mistakes = rows.filter((r) => r.isCorrect === false);
  if (mistakes.length) {
    const answerText = (q: (typeof rows)[number]["q"]) => {
      const c = q.correct_answer as Record<string, unknown>;
      if ("option" in c) return q.options[c.option as number] ?? "";
      if ("value" in c) return c.value ? "True" : "False";
      if ("accepted" in c) return (c.accepted as string[])[0];
      return (c.model_answer as string) ?? "";
    };
    // Partial unique index (one card per question) can't be targeted by an upsert, so skip existing ones.
    const { data: existing } = await supabase
      .from("flashcards")
      .select("source_question_id")
      .in("source_question_id", mistakes.map((r) => r.q.id));
    const have = new Set((existing ?? []).map((e) => e.source_question_id as string));
    const fresh = mistakes.filter((r) => !have.has(r.q.id));
    if (fresh.length) {
      await supabase.from("flashcards").insert(
        fresh.map((r) => ({
          user_id: user.id,
          material_id: r.q.source_material_id,
          section_id: r.q.section_id,
          source_question_id: r.q.id,
          origin: "quiz_mistake",
          front: r.q.prompt.slice(0, 2000),
          back: answerText(r.q).slice(0, 4000) || "See explanation",
          explanation: r.q.explanation,
          source_page: r.q.source_page,
        })),
      );
    }
  }

  revalidatePath("/assessments");
  revalidatePath("/dashboard");
  revalidatePath("/flashcards");
  return { ok: true, attemptId };
}

export async function deleteQuiz(quizId: string): Promise<Result> {
  await requireUser();
  if (!uuid.safeParse(quizId).success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { data: q } = await supabase.from("quizzes").select("id").eq("id", quizId).maybeSingle();
  if (!q) return { ok: false, error: "Quiz not found." };
  // Quizzes are server-owned rows; delete via the service role after the ownership check.
  const { error } = await createAdminClient().from("quizzes").delete().eq("id", quizId);
  if (error) return { ok: false, error: "Could not delete the quiz." };
  revalidatePath("/assessments");
  return { ok: true };
}
