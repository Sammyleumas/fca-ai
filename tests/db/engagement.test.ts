import { afterAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, asRole, asSuperuser, closePool, createUser, getPool, insertMaterial } from "./helpers";

const d = TEST_DATABASE_URL ? describe : describe.skip;

async function service<T>(sql: string, params: unknown[]): Promise<T[]> {
  const c = await getPool().connect();
  try {
    await c.query("begin");
    await c.query("set local role service_role");
    const r = await c.query(sql, params);
    await c.query("commit");
    return r.rows as T[];
  } finally {
    c.release();
  }
}

async function onboardedUser(tz = "Africa/Lagos", prefs: Record<string, unknown> = {}) {
  const u = await createUser();
  await asSuperuser((c) =>
    c.query(
      "update public.profiles set onboarding_completed_at = now(), timezone = $2, notification_prefs = notification_prefs || $3::jsonb where id = $1",
      [u, tz, JSON.stringify(prefs)],
    ),
  );
  return u;
}

const gen = (u: string, at: string) => service<{ n: number }>("select public.generate_user_notifications($1, $2::timestamptz) as n", [u, at]).then((r) => r[0].n);
const kinds = (u: string) => asSuperuser((c) => c.query<{ kind: string; dedupe_key: string }>("select kind, dedupe_key from public.notifications where user_id = $1 order by created_at", [u])).then((r) => r.rows);

d("reminders", () => {
  afterAll(closePool);

  it("sends the daily reminder after the chosen local time, once per day, never in quiet hours", async () => {
    const u = await onboardedUser("Africa/Lagos", { reminder_time: "18:00" });
    expect(await gen(u, "2026-11-20T16:30:00Z")).toBe(0); // 17:30 in Lagos
    expect(await gen(u, "2026-11-20T17:30:00Z")).toBe(1); // 18:30 in Lagos
    expect(await gen(u, "2026-11-20T18:30:00Z")).toBe(0); // same day: deduplicated
    expect(await gen(u, "2026-11-20T22:30:00Z")).toBe(0); // 23:30: quiet hours
    expect((await kinds(u)).map((k) => k.dedupe_key)).toEqual(["daily:2026-11-20"]);
  });

  it("skips the daily reminder when the student already studied, and honours opt-outs", async () => {
    const u = await onboardedUser("UTC");
    await asSuperuser((c) =>
      c.query("insert into public.study_activity (user_id, kind, activity_date, qualifies_for_streak) values ($1, 'task_completed', '2026-11-20', true)", [u]),
    );
    expect(await gen(u, "2026-11-20T19:00:00Z")).toBe(0);
    const off = await onboardedUser("UTC", { daily_reminder: false });
    expect(await gen(off, "2026-11-20T19:00:00Z")).toBe(0);
  });

  it("announces today's sessions, missed sessions and the daily quiz, and nudges a live streak", async () => {
    const u = await onboardedUser("UTC");
    await asSuperuser(async (c) => {
      const p = await c.query<{ id: string }>(
        "insert into public.study_plans (user_id, title, mode, status, start_date, deadline, daily_minutes) values ($1, 'Exam', 'individual', 'active', '2026-11-15', '2026-11-30', 60) returning id",
        [u],
      );
      await c.query(
        `insert into public.study_sessions (plan_id, user_id, scheduled_date, planned_minutes, kind, title) values
         ($1, $2, '2026-11-20', 45, 'study', 'Today'), ($1, $2, '2026-11-18', 45, 'study', 'Missed'), ($1, $2, '2026-11-20', 10, 'assessment', 'Quiz')`,
        [p.rows[0].id, u],
      );
      await c.query("update public.study_streaks set current_streak = 4, last_qualifying_date = '2026-11-19' where user_id = $1", [u]);
    });
    await gen(u, "2026-11-20T08:00:00Z");
    await gen(u, "2026-11-20T19:00:00Z");
    const ks = (await kinds(u)).map((k) => k.kind).sort();
    expect(ks).toEqual(["quiz_reminder", "streak", "study_reminder", "unfinished_task", "upcoming_session"]);
  });

  it("lets students refresh only their own reminders", async () => {
    const u = await onboardedUser("UTC");
    await expect(asRole("authenticated", u, (c) => c.query("select public.generate_user_notifications($1)", [u]))).rejects.toThrow(/permission denied/);
    await asRole("authenticated", u, (c) => c.query("select public.refresh_my_notifications()"));
  });
});

d("analytics_summary", () => {
  it("summarises real activity for the caller only", async () => {
    const u = await onboardedUser("UTC");
    const other = await onboardedUser("UTC");
    await asSuperuser(async (c) => {
      const m = await insertMaterial(c, u, "Networks");
      await c.query("update public.materials set status = 'ready' where id = $1", [m]);
      await c.query(
        `insert into public.study_activity (user_id, kind, activity_date, minutes, material_id, qualifies_for_streak) values
         ($1, 'reading', current_date, 40, $2, false), ($1, 'task_completed', current_date - 1, 30, $2, true),
         ($1, 'reading', current_date - 40, 50, $2, false)`,
        [u, m],
      );
      await c.query("insert into public.study_activity (user_id, kind, activity_date, minutes) values ($1, 'reading', current_date, 999)", [other]);
      const q = await c.query<{ id: string }>("insert into public.quizzes (user_id, title, status, material_id) values ($1, 'Q', 'ready', $2) returning id", [u, m]);
      await c.query(
        `insert into public.quiz_attempts (quiz_id, user_id, status, percent, submitted_at, feedback) values
         ($1, $2, 'graded', 90, now(), '{"topics":[{"topic":"TCP","score":2,"max":2},{"topic":"UDP","score":0,"max":2}]}'),
         ($1, $2, 'graded', 50, now(), '{"topics":[{"topic":"UDP","score":1,"max":2}]}')`,
        [q.rows[0].id, u],
      );
    });
    const s = await asRole("authenticated", u, async (c) => (await c.query<{ s: import("@/lib/analytics/insights").AnalyticsSummary }>("select public.analytics_summary(30) as s")).rows[0].s);
    expect(s.totals.minutes).toBe(70);
    expect(s.totals.prev_minutes).toBe(50);
    expect(s.totals.active_days).toBe(2);
    expect(Number(s.totals.avg_quiz)).toBe(70);
    expect(s.daily).toHaveLength(30);
    expect(s.heatmap).toHaveLength(84);
    expect(s.topics.map((t) => [t.topic, Number(t.percent)])).toEqual([["UDP", 25], ["TCP", 100]]);
    expect(s.materials[0]).toMatchObject({ title: "Networks", minutes: 70, quiz_count: 2 });
    expect(s.week.goal_minutes).toBe(300);
  });
});
