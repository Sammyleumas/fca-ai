import { afterAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, asRole, asSuperuser, closePool, createUser, insertMaterial } from "./helpers";

const d = TEST_DATABASE_URL ? describe : describe.skip;

d("assessments & flashcards", () => {
  afterAll(closePool);

  it("allows only one live daily quiz per session", async () => {
    const u = await createUser();
    await expect(
      asSuperuser(async (c) => {
        const m = await insertMaterial(c, u);
        const plan = await c.query<{ id: string }>(
          "insert into public.study_plans (user_id, title, mode, start_date, deadline, daily_minutes) values ($1, 'P', 'individual', current_date, current_date + 3, 60) returning id",
          [u],
        );
        const s = await c.query<{ id: string }>(
          "insert into public.study_sessions (plan_id, user_id, scheduled_date, planned_minutes, title, kind) values ($1, $2, current_date, 10, 'Quiz', 'assessment') returning id",
          [plan.rows[0].id, u],
        );
        await c.query("insert into public.quizzes (user_id, session_id, title, kind, status) values ($1, $2, 'Q', 'daily', 'failed')", [u, s.rows[0].id]);
        await c.query("insert into public.quizzes (user_id, session_id, title, kind, status) values ($1, $2, 'Q', 'daily', 'ready')", [u, s.rows[0].id]);
        void m;
        await c.query("insert into public.quizzes (user_id, session_id, title, kind, status) values ($1, $2, 'Q', 'daily', 'generating')", [u, s.rows[0].id]);
      }),
    ).rejects.toThrow(/duplicate key/);
  });

  it("reviews a flashcard atomically, clamping the schedule, and only for the owner", async () => {
    const u = await createUser();
    const other = await createUser();
    const card = await asRole(
      "authenticated",
      u,
      async (c) => (await c.query<{ id: string }>("insert into public.flashcards (user_id, front, back) values ($1, 'Q', 'A') returning id", [u])).rows[0].id,
      { commit: true },
    );
    await asRole("authenticated", u, (c) =>
      c.query("select public.review_flashcard($1, 'know', 9.9, 6, 2, now() - interval '5 days')", [card]), { commit: true });
    const row = await asSuperuser((c) =>
      c.query<{ ease_factor: string; interval_days: number; overdue: boolean }>(
        "select ease_factor, interval_days, due_at < now() - interval '1 minute' as overdue from public.flashcards where id = $1",
        [card],
      ),
    );
    expect(row.rows[0]).toEqual({ ease_factor: "3.00", interval_days: 6, overdue: false });
    const log = await asSuperuser((c) => c.query("select rating from public.flashcard_reviews where flashcard_id = $1", [card]));
    expect(log.rows).toEqual([{ rating: "know" }]);
    await expect(
      asRole("authenticated", other, (c) => c.query("select public.review_flashcard($1, 'know', 2.5, 1, 1, now())", [card])),
    ).rejects.toThrow(/flashcard not found/);
  });

  it("creates at most one mistake flashcard per question", async () => {
    const u = await createUser();
    await expect(
      asSuperuser(async (c) => {
        const q = await c.query<{ id: string }>("insert into public.quizzes (user_id, title, status) values ($1, 'Q', 'ready') returning id", [u]);
        const qq = await c.query<{ id: string }>(
          "insert into public.quiz_questions (quiz_id, user_id, position, type, prompt, correct_answer) values ($1, $2, 0, 'mcq', 'P', '{}') returning id",
          [q.rows[0].id, u],
        );
        for (let i = 0; i < 2; i++) {
          await c.query("insert into public.flashcards (user_id, front, back, origin, source_question_id) values ($1, 'F', 'B', 'quiz_mistake', $2)", [u, qq.rows[0].id]);
        }
      }),
    ).rejects.toThrow(/duplicate key/);
  });
});
