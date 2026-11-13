import { afterAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, asRole, asSuperuser, closePool, createUser, insertMaterial } from "./helpers";

const d = TEST_DATABASE_URL ? describe : describe.skip;
type R = { percent: string; pages_read: number; total_seconds: number; completed_sections: number };

async function setup() {
  const u = await createUser();
  const m = await asSuperuser(async (c) => {
    const id = await insertMaterial(c, u);
    await c.query("update public.materials set status = 'ready', page_count = 10 where id = $1", [id]);
    const ch = await c.query<{ id: string }>(
      "insert into public.document_sections (material_id, user_id, level, position, title, start_page, end_page) values ($1, $2, 1, 0, 'Ch', 1, 10) returning id",
      [id, u],
    );
    await c.query(
      "insert into public.document_sections (material_id, user_id, parent_id, level, position, title, start_page, end_page) values ($1, $2, $3, 3, 0, 'U1', 1, 3), ($1, $2, $3, 3, 1, 'U2', 4, 10)",
      [id, u, ch.rows[0].id],
    );
    return id;
  });
  return { u, m };
}

const save = (u: string, m: string, page: number, pages: number[], seconds: number) =>
  asRole("authenticated", u, async (c) =>
    (await c.query<{ r: R }>("select public.save_reading_progress($1, $2, 0.5, $3, $4) as r", [m, page, pages, seconds])).rows[0].r,
  { commit: true });

d("save_reading_progress", () => {
  afterAll(closePool);

  it("merges pages, computes percent and completed leaf sections", async () => {
    const { u, m } = await setup();
    await save(u, m, 2, [1, 2], 30);
    const r = await save(u, m, 3, [2, 3, 99, -1], 45);
    expect(Number(r.percent)).toBe(30);
    expect(r.pages_read).toBe(3);
    expect(r.completed_sections).toBe(1); // U1 (pages 1-3); the chapter isn't a leaf
    expect(r.total_seconds).toBe(75);
    const row = await asSuperuser((c) => c.query("select current_page, pages_read from public.reading_progress where material_id = $1", [m]));
    expect(row.rows[0]).toEqual({ current_page: 3, pages_read: [1, 2, 3] });
  });

  it("caps seconds per save and turns whole minutes into reading activity", async () => {
    const { u, m } = await setup();
    await save(u, m, 1, [1], 5000); // capped to 300 s
    const r = await save(u, m, 1, [1], 30);
    expect(r.total_seconds).toBe(330);
    const minutes = await asSuperuser((c) =>
      c.query<{ sum: string }>("select sum(minutes) from public.study_activity where user_id = $1 and kind = 'reading'", [u]),
    );
    expect(Number(minutes.rows[0].sum)).toBe(5);
  });

  it("rejects other students' materials", async () => {
    const { m } = await setup();
    const intruder = await createUser();
    await expect(save(intruder, m, 1, [1], 10)).rejects.toThrow(/material not found/);
  });
});
