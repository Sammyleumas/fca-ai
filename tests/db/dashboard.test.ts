import { afterAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, asRole, asSuperuser, closePool, createUser, insertMaterial } from "./helpers";

const d = TEST_DATABASE_URL ? describe : describe.skip;

type Stats = {
  today: string;
  materials_total: number;
  overall_completion: number;
  avg_quiz_score: number | null;
  total_study_minutes: number;
  today_minutes: number;
  tasks_today_total: number;
  tasks_today_done: number;
  week: { date: string; minutes: number; qualified: boolean }[];
  streak: { current_streak: number };
};

const stats = (u: string) =>
  asRole("authenticated", u, async (c) => (await c.query<{ s: Stats }>("select public.dashboard_stats() as s")).rows[0].s);

d("dashboard_stats()", () => {
  afterAll(closePool);

  it("returns honest zeros for a brand-new student", async () => {
    const u = await createUser();
    const s = await stats(u);
    expect(s.materials_total).toBe(0);
    expect(s.overall_completion).toBe(0);
    expect(s.avg_quiz_score).toBeNull();
    expect(s.total_study_minutes).toBe(0);
    expect(s.week).toHaveLength(7);
    expect(s.week.every((w) => w.minutes === 0)).toBe(true);
    expect(s.streak.current_streak).toBe(0);
  });

  it("aggregates only the caller's real data", async () => {
    const u = await createUser();
    const other = await createUser();
    await asSuperuser(async (c) => {
      const m1 = await insertMaterial(c, u, "A");
      await insertMaterial(c, u, "B");
      await insertMaterial(c, other, "Other");
      await c.query(
        "insert into public.reading_progress (user_id, material_id, percent_complete) values ($1, $2, 60)",
        [u, m1],
      );
      const q = await c.query<{ id: string }>("insert into public.quizzes (user_id, title, status) values ($1, 'Q', 'ready') returning id", [u]);
      await c.query(
        "insert into public.quiz_attempts (quiz_id, user_id, status, percent) values ($1, $2, 'graded', 80), ($1, $2, 'graded', 90), ($1, $2, 'in_progress', null)",
        [q.rows[0].id, u],
      );
      await c.query(
        "insert into public.study_activity (user_id, kind, activity_date, minutes) values ($1, 'reading', public.user_local_date($1), 25), ($1, 'reading', public.user_local_date($1) - 2, 40), ($1, 'reading', public.user_local_date($1) - 30, 15)",
        [u],
      );
      await c.query(
        "insert into public.study_activity (user_id, kind, activity_date, minutes) values ($1, 'reading', public.user_local_date($1), 500)",
        [other],
      );
    });
    const s = await stats(u);
    expect(s.materials_total).toBe(2);
    expect(Number(s.overall_completion)).toBe(30);
    expect(Number(s.avg_quiz_score)).toBe(85);
    expect(s.total_study_minutes).toBe(80);
    expect(s.today_minutes).toBe(25);
    expect(s.week.at(-1)?.minutes).toBe(25);
    expect(s.week.at(-3)?.minutes).toBe(40);
  });

  it("rejects anonymous callers", async () => {
    await expect(asRole("anon", null, (c) => c.query("select public.dashboard_stats()"))).rejects.toThrow(/permission denied/);
  });
});
