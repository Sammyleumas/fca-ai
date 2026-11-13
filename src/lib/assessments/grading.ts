import type { CorrectAnswer, QuestionType, StudentAnswer } from "./questions";

/** Lower-case, strip accents/punctuation, collapse spaces — for fill-in-the-blank matching. */
export function normaliseAnswer(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/(\d),(?=\d{3}\b)/g, "$1") // 1,000 -> 1000
    .replace(/[“”"'`’]/g, "")
    .replace(/[^\p{L}\p{N}.\s-]/gu, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "");
}

function sameNumber(a: string, b: string) {
  const x = Number(a.replace(/,/g, ""));
  const y = Number(b.replace(/,/g, ""));
  return a !== "" && b !== "" && Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 1e-9;
}

export type ObjectiveResult = { isCorrect: boolean; points: number };

/** Deterministic marking for objective questions. Returns null for open questions. */
export function gradeObjective(type: QuestionType, correct: CorrectAnswer, answer: StudentAnswer, points: number): ObjectiveResult | null {
  if (type === "short_answer" || type === "theory") return null;
  let ok = false;
  if (type === "mcq" && "option" in correct) ok = answer?.option === correct.option;
  if (type === "true_false" && "value" in correct) ok = answer?.value === correct.value;
  if (type === "fill_blank" && "accepted" in correct) {
    const given = normaliseAnswer(answer?.text ?? "");
    ok = given.length > 0 && correct.accepted.some((a) => normaliseAnswer(a) === given || sameNumber(normaliseAnswer(a), given));
  }
  return { isCorrect: ok, points: ok ? points : 0 };
}

export type GradedQuestion = {
  topic: string | null;
  section_id: string | null;
  points: number;
  awarded: number | null; // null = could not be graded
};

export type AttemptSummary = {
  score: number;
  maxScore: number;
  percent: number;
  correct: number;
  incorrect: number;
  ungraded: number;
  topics: { topic: string; sectionId: string | null; score: number; max: number; percent: number }[];
  mastered: string[];
  needsRevision: string[];
};

/**
 * Scores an attempt. Ungraded answers are excluded from both score and maximum
 * (never guessed). A topic is mastered at ≥ 80 % and needs revision below 60 %.
 */
export function summariseAttempt(qs: GradedQuestion[]): AttemptSummary {
  const graded = qs.filter((q) => q.awarded !== null);
  const score = graded.reduce((n, q) => n + (q.awarded ?? 0), 0);
  const maxScore = graded.reduce((n, q) => n + q.points, 0);
  const byTopic = new Map<string, { sectionId: string | null; score: number; max: number }>();
  for (const q of graded) {
    const t = q.topic?.trim() || "General";
    const e = byTopic.get(t) ?? { sectionId: q.section_id, score: 0, max: 0 };
    e.score += q.awarded ?? 0;
    e.max += q.points;
    byTopic.set(t, e);
  }
  const topics = [...byTopic.entries()]
    .map(([topic, v]) => ({ topic, sectionId: v.sectionId, score: round(v.score), max: v.max, percent: v.max ? Math.round((v.score / v.max) * 100) : 0 }))
    .sort((a, b) => a.percent - b.percent);
  return {
    score: round(score),
    maxScore,
    percent: maxScore ? Math.round((score / maxScore) * 1000) / 10 : 0,
    correct: graded.filter((q) => (q.awarded ?? 0) >= q.points * 0.999).length,
    incorrect: graded.filter((q) => (q.awarded ?? 0) < q.points * 0.5).length,
    ungraded: qs.length - graded.length,
    topics,
    mastered: topics.filter((t) => t.percent >= 80).map((t) => t.topic),
    needsRevision: topics.filter((t) => t.percent < 60).map((t) => t.topic),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
