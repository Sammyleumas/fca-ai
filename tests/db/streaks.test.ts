import { afterAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, asRole, asSuperuser, closePool, createUser, insertMaterial } from "./helpers";

const d = TEST_DATABASE_URL ? describe : describe.skip;

async function setupCompletedTask(userId: string) {
  return asSuperuser(async (c) => {
    const materialId = await insertMaterial(c, userId);
    const plan = await c.query<{ id: string }>(
      `insert into public.study_plans (user_id, title, mode, start_date, deadline, daily_minutes)
       values ($1, 'Plan', 'individual', current_date, current_date + 7, 60) returning id`,
      [userId],
    );
    const session = await c.query<{ id: string }>(
      `insert into public.study_sessions (plan_id, user_id, scheduled_date, planned_minutes, title)
       values ($1, $2, current_date, 45, 'Day 1') returning id`,
      [plan.rows[0].id, userId],
    );
    const task = await c.query<{ id: string }>(
      `insert into public.study_tasks (session_id, plan_id, user_id, material_id, title, status, completed_at)
       values ($1, $2, $3, $4, 'Read pages 1-22', 'completed', now()) returning id`,
      [session.rows[0].id, plan.rows[0].id, userId, materialId],
    );
    const pending = await c.query<{ id: string }>(
      `insert into public.study_tasks (session_id, plan_id, user_id, material_id, title)
       values ($1, $2, $3, $4, 'Read pages 23-45') returning id`,
      [session.rows[0].id, plan.rows[0].id, userId, materialId],
    );
    return { taskId: task.rows[0].id, pendingTaskId: pending.rows[0].id, materialId };
  });
}

type Result = {
  recorded: boolean;
  xp_awarded: number;
  current_streak: number;
  new_achievements: { code: string }[];
};

async function record(userId: string, kind: string, minutes = 0, materialId: string | null = null, ref: string | null = null) {
  return asRole(
    "authenticated",
    userId,
    async (c) => {
      const r = await c.query<{ r: Result }>("select public.record_study_activity($1, $2, $3, $4) as r", [
        kind,
        minutes,
        materialId,
        ref,
      ]);
      return r.rows[0].r;
    },
    { commit: true },
  );
}

d("record_study_activity (streaks, XP, achievements)", () => {
  afterAll(closePool);

  it("does not extend the streak for reading alone", async () => {
    const u = await createUser();
    const res = await record(u, "reading", 30);
    expect(res.current_streak).toBe(0);
    expect(res.xp_awarded).toBe(6);
  });

  it("requires a real completed task for task_completed", async () => {
    const u = await createUser();
    const { pendingTaskId } = await setupCompletedTask(u);
    await expect(record(u, "task_completed", 0, null, pendingTaskId)).rejects.toThrow(/completed item/);
    await expect(record(u, "task_completed", 0, null, crypto.randomUUID())).rejects.toThrow(/completed item/);
  });

  it("starts, extends and resets streaks by local day and is idempotent", async () => {
    const u = await createUser();
    const { taskId } = await setupCompletedTask(u);

    const first = await record(u, "task_completed", 0, null, taskId);
    expect(first.current_streak).toBe(1);
    expect(first.new_achievements.map((a) => a.code)).toContain("first_study_session");

    const again = await record(u, "task_completed", 0, null, taskId);
    expect(again.recorded).toBe(false);
    expect(again.current_streak).toBe(1);

    // Pretend the last qualifying day was yesterday with a 6-day streak -> 7 today.
    await asSuperuser((c) =>
      c.query(
        "update public.study_streaks set current_streak = 6, longest_streak = 6, last_qualifying_date = public.user_local_date($1) - 1 where user_id = $1",
        [u],
      ),
    );
    const { taskId: t2 } = await setupCompletedTask(u);
    const seventh = await record(u, "task_completed", 0, null, t2);
    expect(seventh.current_streak).toBe(7);
    expect(seventh.new_achievements.map((a) => a.code)).toEqual(expect.arrayContaining(["streak_3", "streak_7"]));

    // A gap of more than one day resets the streak to 1.
    await asSuperuser((c) =>
      c.query("update public.study_streaks set last_qualifying_date = public.user_local_date($1) - 3 where user_id = $1", [u]),
    );
    const { taskId: t3 } = await setupCompletedTask(u);
    const reset = await record(u, "task_completed", 0, null, t3);
    expect(reset.current_streak).toBe(1);

    const longest = await asSuperuser((c) =>
      c.query<{ longest_streak: number }>("select longest_streak from public.study_streaks where user_id = $1", [u]),
    );
    expect(longest.rows[0].longest_streak).toBe(7);

    const notes = await asRole("authenticated", u, (c) =>
      c.query("select title from public.notifications where kind = 'achievement'"),
    );
    expect(notes.rowCount).toBeGreaterThanOrEqual(3);
  });

  it("caps XP per day", async () => {
    const u = await createUser();
    let total = 0;
    for (let i = 0; i < 30; i++) total += (await record(u, "reading", 240)).xp_awarded;
    expect(total).toBe(300);
  });

  it("uses the student's time zone for the activity date", async () => {
    const u = await createUser();
    await asSuperuser((c) => c.query("update public.profiles set timezone = 'Pacific/Kiritimati' where id = $1", [u]));
    await record(u, "reading", 10);
    const r = await asSuperuser((c) =>
      c.query<{ same: boolean }>(
        "select activity_date = (now() at time zone 'Pacific/Kiritimati')::date as same from public.study_activity where user_id = $1",
        [u],
      ),
    );
    expect(r.rows[0].same).toBe(true);
  });
});
