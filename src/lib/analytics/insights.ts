/**
 * Personalised insights computed only from the analytics summary (real activity).
 * Every sentence is backed by a number the student can see on the page.
 */

export type AnalyticsSummary = {
  today: string;
  from: string;
  days: number;
  daily: { date: string; minutes: number; tasks: number; quizzes: number; qualified: boolean }[];
  totals: {
    minutes: number;
    prev_minutes: number;
    reading_minutes: number;
    active_days: number;
    tasks_completed: number;
    sessions_completed: number;
    quizzes_completed: number;
    flashcard_reviews: number;
    avg_quiz: number | null;
    prev_avg_quiz: number | null;
    materials_completed: number;
    materials_total: number;
    overall_progress: number;
    all_time_minutes: number;
  };
  quiz_trend: { date: string; percent: number; title: string; kind: string }[];
  topics: { topic: string; section_id: string | null; score: number; max: number; attempts: number; percent: number }[];
  materials: { id: string; title: string; subject: string | null; minutes: number; reading_percent: number; quiz_avg: number | null; quiz_count: number }[];
  heatmap: { date: string; minutes: number }[];
  week: { start: string; minutes: number; active_days: number; quizzes: number; flashcard_reviews: number; tasks: number; goal_minutes: number; goal_days: number };
  streak: { current: number; longest: number; last: string | null } | null;
};

export type Insight = { tone: "positive" | "focus" | "info"; text: string; href?: string };

export type SubjectScore = { name: string; quizAvg: number; quizzes: number; minutes: number };

/** Groups materials by subject (falls back to the material title). */
export function subjectScores(materials: AnalyticsSummary["materials"]): SubjectScore[] {
  const map = new Map<string, { sum: number; quizzes: number; minutes: number }>();
  for (const m of materials) {
    const key = m.subject ?? m.title;
    const e = map.get(key) ?? { sum: 0, quizzes: 0, minutes: 0 };
    if (m.quiz_avg !== null && m.quiz_count > 0) {
      e.sum += Number(m.quiz_avg) * m.quiz_count;
      e.quizzes += m.quiz_count;
    }
    e.minutes += m.minutes;
    map.set(key, e);
  }
  return [...map.entries()]
    .map(([name, e]) => ({ name, quizAvg: e.quizzes ? Math.round(e.sum / e.quizzes) : NaN, quizzes: e.quizzes, minutes: e.minutes }))
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));
}

export function percentChange(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

export function buildInsights(s: AnalyticsSummary): Insight[] {
  const out: Insight[] = [];
  const subjects = subjectScores(s.materials).filter((x) => x.quizzes >= 1 && Number.isFinite(x.quizAvg));
  if (subjects.length >= 2) {
    const sorted = [...subjects].sort((a, b) => b.quizAvg - a.quizAvg);
    const best = sorted[0];
    const worst = sorted.at(-1)!;
    if (best.quizAvg - worst.quizAvg >= 15) {
      out.push({
        tone: "focus",
        text: `You consistently perform well in ${best.name} (${best.quizAvg}%), but ${worst.name} (${worst.quizAvg}%) requires more revision.`,
      });
    }
  }

  const weak = s.topics.filter((t) => Number(t.percent) < 60).slice(0, 3);
  if (weak.length) {
    out.push({
      tone: "focus",
      text: `Topics to revise: ${weak.map((t) => `${t.topic} (${Math.round(Number(t.percent))}%)`).join(", ")}.`,
      href: "/flashcards",
    });
  }
  const strong = s.topics.filter((t) => Number(t.percent) >= 85 && t.attempts >= 2);
  if (strong.length) out.push({ tone: "positive", text: `You've mastered ${strong.slice(0, 3).map((t) => t.topic).join(", ")}.` });

  const change = percentChange(s.totals.minutes, s.totals.prev_minutes);
  if (change !== null && Math.abs(change) >= 15) {
    out.push(
      change > 0
        ? { tone: "positive", text: `You studied ${change}% more than in the previous ${s.days} days.` }
        : { tone: "info", text: `Study time is down ${Math.abs(change)}% on the previous ${s.days} days. A short session today helps you get back on track.` },
    );
  }
  if (s.totals.avg_quiz !== null && s.totals.prev_avg_quiz !== null) {
    const diff = Math.round(Number(s.totals.avg_quiz) - Number(s.totals.prev_avg_quiz));
    if (Math.abs(diff) >= 5) {
      out.push(diff > 0 ? { tone: "positive", text: `Your average quiz score improved by ${diff} points.` } : { tone: "focus", text: `Your average quiz score dropped ${Math.abs(diff)} points — revisit recent topics before moving on.` });
    }
  }

  const consistency = s.totals.active_days / Math.max(1, s.days);
  if (s.totals.minutes > 0 && consistency < 0.4) {
    out.push({ tone: "info", text: "Short, regular sessions beat occasional long ones. Try studying a little on more days." });
  }
  if (s.daily.some((d) => d.minutes > 360)) {
    out.push({ tone: "info", text: "Some days went over six hours. Breaks and sleep help memory — your daily XP is capped for a reason." });
  }
  if (!s.totals.quizzes_completed && s.totals.minutes > 0) {
    out.push({ tone: "info", text: "Take a quiz to find out which topics need more attention.", href: "/assessments" });
  }
  if (!out.length) {
    out.push(
      s.totals.minutes
        ? { tone: "positive", text: "Steady progress — keep following your plan." }
        : { tone: "info", text: "No study activity yet in this period. Complete a task or quiz to see insights here.", href: "/planner" },
    );
  }
  return out.slice(0, 6);
}

export type Challenge = { id: string; title: string; target: number; progress: number; unit: string };

/** Weekly learning challenges, scaled to the student's own weekly goal. */
export function weeklyChallenges(w: AnalyticsSummary["week"]): Challenge[] {
  return [
    { id: "minutes", title: "Reach your weekly study goal", target: w.goal_minutes, progress: w.minutes, unit: "min" },
    { id: "days", title: `Study on ${w.goal_days} days`, target: w.goal_days, progress: w.active_days, unit: "days" },
    { id: "quizzes", title: "Complete 3 quizzes", target: 3, progress: w.quizzes, unit: "quizzes" },
    { id: "cards", title: "Review 30 flashcards", target: 30, progress: w.flashcard_reviews, unit: "cards" },
  ].map((c) => ({ ...c, progress: Math.min(c.progress, c.target) }));
}
