import { describe, expect, it } from "vitest";
import { validateQuestions, type GeneratedQuestion } from "@/lib/assessments/questions";
import { gradeObjective, normaliseAnswer, summariseAttempt } from "@/lib/assessments/grading";
import { schedule } from "@/lib/flashcards/srs";

const g = (p: Partial<GeneratedQuestion>): GeneratedQuestion => ({
  type: "mcq", prompt: "What does TCP guarantee?", options: ["Ordered delivery", "Low latency", "No headers", "Broadcast"],
  correct_option_index: 0, correct_boolean: false, accepted_answers: [], model_answer: "", key_points: [],
  explanation: "TCP is reliable.", source_page: 12, topic: "TCP", difficulty: 3, ...p,
});
const sources = [{ materialId: "m1", page: 12, sectionId: "s1", sectionTitle: "Transport" }];
const ALL = ["mcq", "true_false", "fill_blank", "short_answer", "theory"] as const;

describe("question validation", () => {
  it("keeps well-formed questions and attaches source material, section and points", () => {
    const [q] = validateQuestions([g({})], sources, [...ALL], 10);
    expect(q).toMatchObject({ type: "mcq", correct_answer: { option: 0 }, source_material_id: "m1", section_id: "s1", source_page: 12, points: 1 });
  });

  it("drops unsupported or malformed questions", () => {
    const out = validateQuestions(
      [
        g({ source_page: 99 }), // page not in the excerpt
        g({ correct_option_index: 7 }),
        g({ options: ["A", "a", "B"] }), // duplicate options
        g({ type: "fill_blank", prompt: "TCP uses a handshake.", accepted_answers: ["three-way"] }), // no blank
        g({ type: "theory", prompt: "Discuss reliability in networks.", model_answer: "", key_points: ["x"] }),
        g({ type: "true_false", prompt: "UDP is connectionless.", correct_boolean: true }),
        g({}),
        g({}), // duplicate prompt
      ],
      sources,
      [...ALL],
      10,
    );
    expect(out.map((q) => q.type)).toEqual(["true_false", "mcq"]);
    expect(out.map((q) => q.position)).toEqual([0, 1]);
  });

  it("respects requested types and the maximum", () => {
    const qs = [g({ prompt: "Question one about TCP?" }), g({ prompt: "Question two about TCP?" }), g({ type: "true_false", prompt: "A true or false item." })];
    expect(validateQuestions(qs, sources, ["mcq"], 1)).toHaveLength(1);
    expect(validateQuestions(qs, sources, ["true_false"], 5).map((q) => q.type)).toEqual(["true_false"]);
  });
});

describe("objective grading", () => {
  it("marks mcq, true/false and fill-in answers deterministically", () => {
    expect(gradeObjective("mcq", { option: 2 }, { option: 2 }, 1)).toEqual({ isCorrect: true, points: 1 });
    expect(gradeObjective("mcq", { option: 2 }, null, 1)).toEqual({ isCorrect: false, points: 0 });
    expect(gradeObjective("true_false", { value: false }, { value: false }, 1)?.isCorrect).toBe(true);
    expect(gradeObjective("fill_blank", { accepted: ["Three-way handshake"] }, { text: "  the three-way HANDSHAKE. " }, 1)?.isCorrect).toBe(true);
    expect(gradeObjective("fill_blank", { accepted: ["1,000"] }, { text: "1000" }, 1)?.isCorrect).toBe(true);
    expect(gradeObjective("fill_blank", { accepted: ["router"] }, { text: "" }, 1)?.isCorrect).toBe(false);
    expect(gradeObjective("theory", { model_answer: "x", key_points: ["y"] }, { text: "z" }, 4)).toBeNull();
  });

  it("normalises answers", () => {
    expect(normaliseAnswer("Café “Résumé”!")).toBe("cafe resume");
  });
});

describe("attempt summary", () => {
  it("scores graded questions only and groups topics", () => {
    const s = summariseAttempt([
      { topic: "TCP", section_id: "s1", points: 1, awarded: 1 },
      { topic: "TCP", section_id: "s1", points: 1, awarded: 1 },
      { topic: "UDP", section_id: "s2", points: 1, awarded: 0 },
      { topic: "UDP", section_id: "s2", points: 2, awarded: 1 },
      { topic: "Routing", section_id: "s3", points: 4, awarded: null },
    ]);
    expect(s).toMatchObject({ score: 3, maxScore: 5, percent: 60, correct: 2, incorrect: 1, ungraded: 1, mastered: ["TCP"], needsRevision: ["UDP"] });
    expect(s.topics[0]).toMatchObject({ topic: "UDP", percent: 33 });
  });
});

describe("spaced repetition", () => {
  const now = new Date("2026-11-20T10:00:00Z");
  it("grows intervals for known cards and brings difficult ones back soon", () => {
    let c = { ease: 2.5, intervalDays: 0, repetitions: 0 };
    const intervals: number[] = [];
    for (let i = 0; i < 4; i++) {
      const s = schedule(c, "know", now);
      intervals.push(s.intervalDays);
      c = s;
    }
    expect(intervals).toEqual([1, 3, 8, 23]);
    const hard = schedule(c, "difficult", now);
    expect(hard).toMatchObject({ intervalDays: 0, repetitions: 0 });
    expect(hard.dueAt.getTime() - now.getTime()).toBe(10 * 60_000);
    expect(schedule({ ease: 1.35, intervalDays: 5, repetitions: 3 }, "difficult", now).ease).toBe(1.3);
    expect(schedule(c, "practice", now)).toMatchObject({ intervalDays: 1, repetitions: c.repetitions });
  });
});
