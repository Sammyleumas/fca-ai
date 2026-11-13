import { describe, expect, it } from "vitest";
import { buildInsights, percentChange, subjectScores, weeklyChallenges, type AnalyticsSummary } from "@/lib/analytics/insights";

const base: AnalyticsSummary = {
  today: "2026-11-20", from: "2026-10-22", days: 30,
  daily: [{ date: "2026-11-20", minutes: 40, tasks: 1, quizzes: 0, qualified: true }],
  totals: { minutes: 600, prev_minutes: 400, reading_minutes: 300, active_days: 20, tasks_completed: 10, sessions_completed: 5, quizzes_completed: 6, flashcard_reviews: 40, avg_quiz: 75, prev_avg_quiz: 65, materials_completed: 1, materials_total: 3, overall_progress: 40, all_time_minutes: 1000 },
  quiz_trend: [],
  topics: [
    { topic: "Normalisation", section_id: null, score: 1, max: 4, attempts: 2, percent: 25 },
    { topic: "Routing", section_id: null, score: 9, max: 10, attempts: 3, percent: 90 },
  ],
  materials: [
    { id: "1", title: "Networks book", subject: "Computer Networks", minutes: 300, reading_percent: 60, quiz_avg: 88, quiz_count: 4 },
    { id: "2", title: "DB notes", subject: "Databases", minutes: 200, reading_percent: 20, quiz_avg: 52, quiz_count: 2 },
  ],
  heatmap: [],
  week: { start: "2026-11-16", minutes: 120, active_days: 3, quizzes: 5, flashcard_reviews: 10, tasks: 4, goal_minutes: 300, goal_days: 5 },
  streak: { current: 3, longest: 7, last: "2026-11-20" },
};

describe("insights", () => {
  it("compares subjects, flags weak topics and reports trends from real numbers", () => {
    const texts = buildInsights(base).map((i) => i.text);
    expect(texts).toContain("You consistently perform well in Computer Networks (88%), but Databases (52%) requires more revision.");
    expect(texts).toContain("Topics to revise: Normalisation (25%).");
    expect(texts).toContain("You've mastered Routing.");
    expect(texts).toContain("You studied 50% more than in the previous 30 days.");
    expect(texts).toContain("Your average quiz score improved by 10 points.");
  });

  it("encourages regularity and healthy limits, and handles empty periods", () => {
    const sparse = buildInsights({ ...base, topics: [], materials: [], totals: { ...base.totals, active_days: 3, prev_minutes: 0, prev_avg_quiz: null }, daily: [{ ...base.daily[0], minutes: 420 }] });
    expect(sparse.map((i) => i.text).join(" ")).toMatch(/Short, regular sessions/);
    expect(sparse.map((i) => i.text).join(" ")).toMatch(/over six hours/);
    const empty = buildInsights({ ...base, topics: [], materials: [], totals: { ...base.totals, minutes: 0, prev_minutes: 0, avg_quiz: null, prev_avg_quiz: null, quizzes_completed: 0 } });
    expect(empty).toEqual([{ tone: "info", text: "No study activity yet in this period. Complete a task or quiz to see insights here.", href: "/planner" }]);
  });

  it("groups subjects and computes changes", () => {
    expect(subjectScores(base.materials).map((s) => [s.name, s.quizAvg])).toEqual([["Computer Networks", 88], ["Databases", 52]]);
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(5, 0)).toBeNull();
  });

  it("builds weekly challenges capped at their targets", () => {
    const c = weeklyChallenges(base.week);
    expect(c.find((x) => x.id === "quizzes")).toMatchObject({ progress: 3, target: 3 });
    expect(c.find((x) => x.id === "minutes")).toMatchObject({ progress: 120, target: 300 });
  });
});
