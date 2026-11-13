import "server-only";
import { z } from "zod";
import { AIError, getAIProvider } from "@/lib/ai";
import { recordAIUsage } from "@/lib/ai/guard";
import { GRADING_SYSTEM_PROMPT, QUIZ_SYSTEM_PROMPT, quizUserPrompt } from "@/lib/ai/prompts/assessment";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatedQuizSchema, validateQuestions, type QuestionType } from "./questions";
import type { Excerpt } from "./sources";

export type QuizSpec = {
  userId: string;
  title: string;
  kind: "daily" | "practice" | "mock";
  sessionId?: string | null;
  planId?: string | null;
  materialId?: string | null;
  count: number;
  types: QuestionType[];
  timeLimitSeconds: number | null;
};

/**
 * Creates the quiz row first (status "generating"), asks the AI for questions
 * from the excerpts, validates them and stores them. On failure the quiz is
 * marked failed with a friendly error — nothing half-written is shown.
 */
export async function generateQuiz(spec: QuizSpec, excerpts: Excerpt[]): Promise<{ quizId: string; error?: string }> {
  const admin = createAdminClient();
  const sourceMaterials = [...new Set(excerpts.map((e) => e.materialId))];
  const { data: quiz, error } = await admin
    .from("quizzes")
    .insert({
      user_id: spec.userId,
      session_id: spec.sessionId ?? null,
      plan_id: spec.planId ?? null,
      material_id: spec.materialId ?? (sourceMaterials.length === 1 ? sourceMaterials[0] : null),
      title: spec.title.slice(0, 200),
      kind: spec.kind,
      status: "generating",
      time_limit_seconds: spec.timeLimitSeconds,
      source_section_ids: [...new Set(excerpts.map((e) => e.sectionId).filter(Boolean))] as string[],
      source_material_ids: sourceMaterials,
      config: { count: spec.count, types: spec.types },
    })
    .select("id")
    .single();
  if (error || !quiz) {
    if (error?.code === "23505") {
      const { data: existing } = await admin.from("quizzes").select("id").eq("session_id", spec.sessionId!).eq("kind", "daily").neq("status", "failed").maybeSingle();
      if (existing) return { quizId: existing.id as string };
    }
    throw new Error("Could not create the quiz.");
  }
  const quizId = quiz.id as string;

  const fail = async (message: string) => {
    await admin.from("quizzes").update({ status: "failed", error: message }).eq("id", quizId);
    return { quizId, error: message };
  };

  if (!excerpts.length) return fail("There's no readable text in the selected sections to build a quiz from.");
  try {
    const provider = getAIProvider();
    // Ask for a few extra: some may be discarded by validation.
    const { object, usage } = await provider.generateObject({
      system: QUIZ_SYSTEM_PROMPT,
      messages: [{ role: "user", content: quizUserPrompt({ count: Math.min(spec.count + 3, 40), types: spec.types, excerpts }) }],
      schema: generatedQuizSchema,
      maxTokens: 16000,
      effort: "medium",
    });
    await recordAIUsage(spec.userId, "quiz", usage);
    const rows = validateQuestions(object.questions, excerpts, spec.types, spec.count);
    if (rows.length < Math.min(3, spec.count)) return fail("We couldn't create enough reliable questions from these pages. Try different sections.");
    const { error: qErr } = await admin.from("quiz_questions").insert(rows.map((r) => ({ ...r, quiz_id: quizId, user_id: spec.userId })));
    if (qErr) return fail("Could not save the questions. Please try again.");
    await admin.from("quizzes").update({ status: "ready", question_count: rows.length, error: null }).eq("id", quizId);
    return { quizId };
  } catch (e) {
    return fail(e instanceof AIError ? e.message : "Quiz generation failed. Please try again.");
  }
}

const gradingSchema = z.object({
  grades: z.array(z.object({ index: z.number().int(), score_fraction: z.number(), feedback: z.string() })),
});

export type OpenAnswer = { index: number; prompt: string; modelAnswer: string; keyPoints: string[]; answer: string };

/**
 * AI marking for short-answer and theory questions. Returns null for an answer it
 * couldn't mark (never invents a score). Blank answers score 0 without an AI call.
 */
export async function gradeOpenAnswers(userId: string, items: OpenAnswer[]): Promise<Map<number, { fraction: number; feedback: string } | null>> {
  const out = new Map<number, { fraction: number; feedback: string } | null>();
  const toGrade = items.filter((i) => {
    if (!i.answer.trim()) out.set(i.index, { fraction: 0, feedback: "No answer was given." });
    return i.answer.trim().length > 0;
  });
  if (!toGrade.length) return out;
  try {
    const provider = getAIProvider();
    const content = toGrade
      .map(
        (i) =>
          `<item index="${i.index}">\n<question>${i.prompt}</question>\n<model_answer>${i.modelAnswer}</model_answer>\n<key_points>${i.keyPoints.map((k) => `- ${k}`).join("\n")}</key_points>\n<student_answer>${i.answer.slice(0, 4000).replace(/<\/?[a-z_]+>/gi, "")}</student_answer>\n</item>`,
      )
      .join("\n");
    const { object, usage } = await provider.generateObject({
      system: GRADING_SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
      schema: gradingSchema,
      maxTokens: 6000,
      effort: "medium",
    });
    await recordAIUsage(userId, "grading", usage);
    for (const i of toGrade) {
      const gr = object.grades.find((x) => x.index === i.index);
      out.set(i.index, gr ? { fraction: Math.min(1, Math.max(0, Math.round(gr.score_fraction * 2) / 2)), feedback: gr.feedback.slice(0, 1000) } : null);
    }
  } catch {
    for (const i of toGrade) out.set(i.index, null);
  }
  return out;
}
