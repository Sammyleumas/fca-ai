import { z } from "zod";

export type QuestionType = "mcq" | "true_false" | "fill_blank" | "short_answer" | "theory";
export const QUESTION_TYPES: QuestionType[] = ["mcq", "true_false", "fill_blank", "short_answer", "theory"];
export const TYPE_LABEL: Record<QuestionType, string> = {
  mcq: "Multiple choice",
  true_false: "True or false",
  fill_blank: "Fill in the blank",
  short_answer: "Short answer",
  theory: "Theory",
};

/** Schema the AI must follow (kept flat so structured output stays simple). */
export const generatedQuizSchema = z.object({
  questions: z.array(
    z.object({
      type: z.enum(["mcq", "true_false", "fill_blank", "short_answer", "theory"]),
      prompt: z.string(),
      options: z.array(z.string()),
      correct_option_index: z.number().int(),
      correct_boolean: z.boolean(),
      accepted_answers: z.array(z.string()),
      model_answer: z.string(),
      key_points: z.array(z.string()),
      explanation: z.string(),
      source_page: z.number().int(),
      topic: z.string(),
      difficulty: z.number().int(),
    }),
  ),
});
export type GeneratedQuestion = z.infer<typeof generatedQuizSchema>["questions"][number];

/** Stored shapes (quiz_questions.correct_answer / quiz_answers.answer). */
export type CorrectAnswer =
  | { option: number }
  | { value: boolean }
  | { accepted: string[] }
  | { model_answer: string; key_points: string[] };
export type StudentAnswer = { option?: number; value?: boolean; text?: string } | null;

export type QuestionRow = {
  position: number;
  type: QuestionType;
  prompt: string;
  options: string[];
  correct_answer: CorrectAnswer;
  explanation: string | null;
  topic: string | null;
  section_id: string | null;
  source_material_id: string;
  source_page: number;
  points: number;
  difficulty: number;
};

export const POINTS: Record<QuestionType, number> = { mcq: 1, true_false: 1, fill_blank: 1, short_answer: 2, theory: 4 };

const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

export type SourcePage = { materialId: string; page: number; sectionId: string | null; sectionTitle: string | null };

/**
 * Validates AI-generated questions before anything is stored. Questions are
 * dropped when they cite a page that wasn't in the provided excerpt (prevents
 * unsupported facts), are malformed, duplicated, or of a type not requested.
 */
export function validateQuestions(
  raw: GeneratedQuestion[],
  sources: SourcePage[],
  allowedTypes: QuestionType[],
  max: number,
): QuestionRow[] {
  const byPage = new Map(sources.map((s) => [s.page, s]));
  const seen = new Set<string>();
  const out: QuestionRow[] = [];
  for (const q of raw) {
    if (out.length >= max) break;
    if (!allowedTypes.includes(q.type)) continue;
    const src = byPage.get(q.source_page);
    if (!src) continue;
    const prompt = clean(q.prompt, 1000);
    if (prompt.length < 8) continue;
    const key = prompt.toLowerCase();
    if (seen.has(key)) continue;

    let options: string[] = [];
    let correct: CorrectAnswer;
    switch (q.type) {
      case "mcq": {
        options = q.options.map((o) => clean(o, 300)).filter(Boolean);
        const unique = new Set(options.map((o) => o.toLowerCase()));
        if (options.length < 3 || options.length > 5 || unique.size !== options.length) continue;
        if (q.correct_option_index < 0 || q.correct_option_index >= options.length) continue;
        correct = { option: q.correct_option_index };
        break;
      }
      case "true_false":
        correct = { value: q.correct_boolean };
        break;
      case "fill_blank": {
        if (!/_{3,}/.test(prompt)) continue;
        const accepted = [...new Set(q.accepted_answers.map((a) => clean(a, 120)).filter(Boolean))].slice(0, 6);
        if (!accepted.length) continue;
        correct = { accepted };
        break;
      }
      default: {
        const model = clean(q.model_answer, 2000);
        const points = q.key_points.map((k) => clean(k, 300)).filter(Boolean).slice(0, 8);
        if (!model || !points.length) continue;
        correct = { model_answer: model, key_points: points };
      }
    }
    seen.add(key);
    out.push({
      position: out.length,
      type: q.type,
      prompt,
      options,
      correct_answer: correct,
      explanation: clean(q.explanation, 1500) || null,
      topic: clean(q.topic, 200) || src.sectionTitle,
      section_id: src.sectionId,
      source_material_id: src.materialId,
      source_page: src.page,
      points: POINTS[q.type],
      difficulty: Math.min(5, Math.max(1, Math.round(q.difficulty || 3))),
    });
  }
  return out;
}
