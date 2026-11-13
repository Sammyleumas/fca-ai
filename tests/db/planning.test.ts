import { afterAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, asRole, asSuperuser, closePool, createUser, insertMaterial } from "./helpers";

const d = TEST_DATABASE_URL ? describe : describe.skip;

function planPayload(materialId: string, sections: string[] = []) {
  return {
    title: "Exam plan",
    mode: "individual",
    start_date: "2026-11-16",
    deadline: "2026-11-30",
    daily_minutes: 60,
    study_days: [1, 2, 3, 4, 5],
    workload: "balanced",
    material_ids: [materialId],
    sessions: [
      {
        date: "2026-11-16", minutes: 45, kind: "study", title: "Day 1", objectives: ["Understand TCP"],
        tasks: [{ material_id: materialId, section_id: sections[0] ?? null, title: "Read TCP", start_page: 1, end_page: 10, minutes: 30 }],
      },
      {
        date: "2026-11-17", minutes: 45, kind: "study", title: "Day 2",
        tasks: [{ material_id: materialId, title: "Read UDP", start_page: 11, end_page: 20, minutes: 30 }],
      },
    ],
  };
}

d("planning functions", () => {
  afterAll(closePool);

  it("creates a plan with sessions and tasks atomically", async () => {
    const u = await createUser();
    const m = await asSuperuser((c) => insertMaterial(c, u));
    const planId = await asRole(
      "authenticated",
      u,
      async (c) => (await c.query<{ id: string }>("select public.create_study_plan($1) as id", [planPayload(m)])).rows[0].id,
      { commit: true },
    );
    const counts = await asSuperuser(async (c) => ({
      sessions: (await c.query("select 1 from public.study_sessions where plan_id = $1", [planId])).rowCount,
      tasks: (await c.query("select 1 from public.study_tasks where plan_id = $1", [planId])).rowCount,
      links: (await c.query("select 1 from public.study_plan_materials where plan_id = $1", [planId])).rowCount,
    }));
    expect(counts).toEqual({ sessions: 2, tasks: 2, links: 1 });
  });

  it("refuses plans that reference another student's material (nothing is written)", async () => {
    const u = await createUser();
    const other = await createUser();
    const m = await asSuperuser((c) => insertMaterial(c, other));
    await expect(
      asRole("authenticated", u, (c) => c.query("select public.create_study_plan($1)", [planPayload(m)]), { commit: true }),
    ).rejects.toThrow(/foreign key/);
    const plans = await asSuperuser((c) => c.query("select 1 from public.study_plans where user_id = $1", [u]));
    expect(plans.rowCount).toBe(0);
  });

  it("reschedules unfinished tasks and never moves completed work", async () => {
    const u = await createUser();
    const m = await asSuperuser((c) => insertMaterial(c, u));
    const planId = await asRole(
      "authenticated", u,
      async (c) => (await c.query<{ id: string }>("select public.create_study_plan($1) as id", [planPayload(m)])).rows[0].id,
      { commit: true },
    );
    const rows = await asSuperuser(async (c) =>
      (await c.query<{ id: string; session_id: string; title: string }>("select id, session_id, title from public.study_tasks where plan_id = $1 order by title", [planId])).rows,
    );
    const [tcp, udp] = rows;
    await asSuperuser((c) => c.query("update public.study_tasks set status = 'completed' where id = $1", [tcp.id]));

    const payload = (taskIds: string[]) => ({
      today: "2026-11-18",
      replace_session_ids: [udp.session_id],
      sessions: [{ date: "2026-11-18", minutes: 30, kind: "study", title: "Catch-up", task_ids: taskIds, rescheduled_from: udp.session_id }],
    });

    await expect(
      asRole("authenticated", u, (c) => c.query("select public.apply_plan_reschedule($1, $2)", [planId, payload([tcp.id])])),
    ).rejects.toThrow(/cannot be moved/);

    await asRole("authenticated", u, (c) => c.query("select public.apply_plan_reschedule($1, $2)", [planId, payload([udp.id])]), { commit: true });
    const after = await asSuperuser(async (c) => ({
      old: (await c.query<{ status: string }>("select status from public.study_sessions where id = $1", [udp.session_id])).rows[0].status,
      moved: (await c.query<{ title: string; status: string }>("select s.title, s.status from public.study_tasks t join public.study_sessions s on s.id = t.session_id where t.id = $1", [udp.id])).rows[0],
      tcpSession: (await c.query<{ session_id: string }>("select session_id from public.study_tasks where id = $1", [tcp.id])).rows[0].session_id,
      version: (await c.query<{ version: number }>("select version from public.study_plans where id = $1", [planId])).rows[0].version,
    }));
    expect(after.old).toBe("missed");
    expect(after.moved).toEqual({ title: "Catch-up", status: "scheduled" });
    expect(after.tcpSession).toBe(tcp.session_id);
    expect(after.version).toBe(2);
  });

  it("searches only the caller's pages", async () => {
    const u = await createUser();
    const other = await createUser();
    const [m, mo] = await asSuperuser(async (c) => {
      const a = await insertMaterial(c, u);
      const b = await insertMaterial(c, other);
      await c.query(
        "insert into public.material_pages (material_id, user_id, page_number, content) values ($1, $2, 1, 'Routers forward packets between networks.'), ($1, $2, 2, 'Normalisation removes redundancy in databases.'), ($3, $4, 1, 'Routers are secret here too.')",
        [a, u, b, other],
      );
      return [a, b];
    });
    const r = await asRole("authenticated", u, (c) =>
      c.query<{ material_id: string; page_number: number }>("select material_id, page_number from public.search_material_pages($1, 'how do routers forward packets', 5)", [[m, mo]]),
    );
    expect(r.rows).toEqual([{ material_id: m, page_number: 1 }]);
    const none = await asRole("authenticated", u, (c) => c.query("select * from public.search_material_pages($1, 'the and of', 5)", [[m]]));
    expect(none.rowCount).toBe(0);
  });
});
