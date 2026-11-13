import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TEST_DATABASE_URL,
  asRole,
  asSuperuser,
  closePool,
  createUser,
  insertMaterial,
} from "./helpers";

const d = TEST_DATABASE_URL ? describe : describe.skip;

d("database security (RLS, grants, triggers)", () => {
  let alice: string;
  let bob: string;
  let aliceMaterial: string;

  beforeAll(async () => {
    alice = await createUser({ preferred_name: "Alice" });
    bob = await createUser({ full_name: "Bob Builder" });
    aliceMaterial = await asRole("authenticated", alice, (c) => insertMaterial(c, alice), { commit: true });
  });

  afterAll(closePool);

  it("bootstraps profile, streak and free subscription for new users", async () => {
    const r = await asSuperuser((c) =>
      c.query(
        `select p.preferred_name, p.full_name, s.current_streak, sub.plan
         from public.profiles p
         join public.study_streaks s on s.user_id = p.id
         join public.subscriptions sub on sub.user_id = p.id
         where p.id = $1`,
        [bob],
      ),
    );
    expect(r.rows[0]).toEqual({ preferred_name: "Bob Builder", full_name: "Bob Builder", current_streak: 0, plan: "free" });
  });

  it("isolates materials between students", async () => {
    const seen = await asRole("authenticated", bob, (c) =>
      c.query("select id from public.materials where id = $1", [aliceMaterial]),
    );
    expect(seen.rowCount).toBe(0);

    const updated = await asRole("authenticated", bob, (c) =>
      c.query("update public.materials set title = 'hacked' where id = $1", [aliceMaterial]),
    );
    expect(updated.rowCount).toBe(0);

    const deleted = await asRole("authenticated", bob, (c) =>
      c.query("delete from public.materials where id = $1", [aliceMaterial]),
    );
    expect(deleted.rowCount).toBe(0);

    const own = await asRole("authenticated", alice, (c) =>
      c.query("select id from public.materials where id = $1", [aliceMaterial]),
    );
    expect(own.rowCount).toBe(1);
  });

  it("prevents inserting rows owned by somebody else", async () => {
    await expect(
      asRole("authenticated", bob, (c) => insertMaterial(c, alice)),
    ).rejects.toThrow(/row-level security/);
  });

  it("prevents attaching your rows to another student's material (composite FK)", async () => {
    await expect(
      asRole("authenticated", bob, (c) =>
        c.query("insert into public.bookmarks (user_id, material_id, page_number) values ($1, $2, 1)", [bob, aliceMaterial]),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("lets students edit their profile but not their XP", async () => {
    const ok = await asRole("authenticated", alice, (c) =>
      c.query("update public.profiles set preferred_name = 'Ally', daily_study_minutes = 90 where id = $1", [alice]),
    );
    expect(ok.rowCount).toBe(1);
    await expect(
      asRole("authenticated", alice, (c) => c.query("update public.profiles set xp = 99999 where id = $1", [alice])),
    ).rejects.toThrow(/permission denied/);
    const other = await asRole("authenticated", alice, (c) =>
      c.query("update public.profiles set preferred_name = 'x' where id = $1", [bob]),
    );
    expect(other.rowCount).toBe(0);
  });

  it("does not let students write streaks, subscriptions, quiz results or AI replies", async () => {
    for (const sql of [
      "update public.study_streaks set current_streak = 100",
      "update public.subscriptions set plan = 'premium'",
      `insert into public.quizzes (user_id, title) values ('${alice}', 'fake')`,
      `insert into public.user_achievements (user_id, achievement_id) select '${alice}', id from public.achievements limit 1`,
      "update public.materials set status = 'ready'",
    ]) {
      await expect(asRole("authenticated", alice, (c) => c.query(sql))).rejects.toThrow(/permission denied/);
    }

    const conv = await asRole(
      "authenticated",
      alice,
      async (c) => {
        const r = await c.query<{ id: string }>(
          "insert into public.ai_conversations (user_id, title) values ($1, 'Chat') returning id",
          [alice],
        );
        return r.rows[0].id;
      },
      { commit: true },
    );
    await asRole("authenticated", alice, (c) =>
      c.query("insert into public.ai_messages (conversation_id, user_id, role, content) values ($1, $2, 'user', 'hi')", [conv, alice]),
    );
    await expect(
      asRole("authenticated", alice, (c) =>
        c.query("insert into public.ai_messages (conversation_id, user_id, role, content) values ($1, $2, 'assistant', 'fake')", [conv, alice]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("hides quiz answers until the attempt is submitted", async () => {
    const { quizId, attemptId } = await asSuperuser(async (c) => {
      const q = await c.query<{ id: string }>(
        "insert into public.quizzes (user_id, title, status) values ($1, 'Daily', 'ready') returning id",
        [alice],
      );
      await c.query(
        `insert into public.quiz_questions (quiz_id, user_id, position, type, prompt, options, correct_answer, explanation)
         values ($1, $2, 0, 'mcq', 'What is RAM?', '["a","b"]', '"a"', 'Because')`,
        [q.rows[0].id, alice],
      );
      const a = await c.query<{ id: string }>(
        "insert into public.quiz_attempts (quiz_id, user_id) values ($1, $2) returning id",
        [q.rows[0].id, alice],
      );
      return { quizId: q.rows[0].id, attemptId: a.rows[0].id };
    });

    await expect(
      asRole("authenticated", alice, (c) => c.query("select correct_answer from public.quiz_questions where quiz_id = $1", [quizId])),
    ).rejects.toThrow(/permission denied/);
    const visible = await asRole("authenticated", alice, (c) =>
      c.query("select prompt from public.quiz_questions where quiz_id = $1", [quizId]),
    );
    expect(visible.rows[0].prompt).toBe("What is RAM?");

    const before = await asRole("authenticated", alice, (c) =>
      c.query("select * from public.get_attempt_review($1)", [attemptId]),
    );
    expect(before.rowCount).toBe(0);

    await asSuperuser((c) =>
      c.query("update public.quiz_attempts set status = 'graded', submitted_at = now(), percent = 100 where id = $1", [attemptId]),
    );
    const after = await asRole("authenticated", alice, (c) =>
      c.query("select correct_answer from public.get_attempt_review($1)", [attemptId]),
    );
    expect(after.rows[0].correct_answer).toBe("a");

    const bobView = await asRole("authenticated", bob, (c) =>
      c.query("select * from public.get_attempt_review($1)", [attemptId]),
    );
    expect(bobView.rowCount).toBe(0);
  });

  it("gives anonymous visitors no access to application data", async () => {
    await expect(asRole("anon", null, (c) => c.query("select * from public.materials"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asRole("anon", null, (c) => c.query("select public.record_study_activity('reading', 10)")),
    ).rejects.toThrow(/permission denied/);
  });

  it("restricts storage objects to the owner's folder", async () => {
    await asRole("authenticated", alice, (c) =>
      c.query("insert into storage.objects (bucket_id, name) values ('materials', $1)", [`${alice}/m1/file.pdf`]),
    );
    await expect(
      asRole("authenticated", alice, (c) =>
        c.query("insert into storage.objects (bucket_id, name) values ('materials', $1)", [`${bob}/m1/file.pdf`]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("namespaces rate limits per user and enforces the limit", async () => {
    const results = await asRole("authenticated", alice, async (c) => {
      const out: boolean[] = [];
      for (let i = 0; i < 4; i++) {
        const r = await c.query<{ ok: boolean }>("select public.check_rate_limit('ai:chat', 3, 60) as ok");
        out.push(r.rows[0].ok);
      }
      return out;
    });
    expect(results).toEqual([true, true, true, false]);
  });
});
