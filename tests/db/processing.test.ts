import { afterAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, asRole, asSuperuser, closePool, createUser, getPool, insertMaterial } from "./helpers";

const d = TEST_DATABASE_URL ? describe : describe.skip;

async function asService<T>(sql: string, params: unknown[]): Promise<T[]> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("set local role service_role");
    const r = await client.query(sql, params);
    await client.query("commit");
    return r.rows as T[];
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

d("processing queue", () => {
  afterAll(closePool);

  it("claims each job once, even with concurrent workers", async () => {
    const u = await createUser();
    const jobIds = await asSuperuser(async (c) => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const m = await insertMaterial(c, u, `M${i}`);
        const r = await c.query<{ id: string }>(
          "insert into public.document_processing_jobs (material_id, user_id) values ($1, $2) returning id",
          [m, u],
        );
        ids.push(r.rows[0].id);
      }
      return ids;
    });
    const claims = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        asService<{ id: string }>("select id from public.claim_processing_job($1, $2)", [`w${i}`, u]),
      ),
    );
    const claimed = claims.flat().map((r) => r.id);
    expect(new Set(claimed).size).toBe(claimed.length);
    expect(claimed.sort()).toEqual([...jobIds].sort());
  });

  it("re-claims a running job only after its lease expires", async () => {
    const u = await createUser();
    await asSuperuser(async (c) => {
      const m = await insertMaterial(c, u);
      await c.query(
        "insert into public.document_processing_jobs (material_id, user_id, status, locked_at) values ($1, $2, 'running', now() - interval '1 minute')",
        [m, u],
      );
    });
    expect(await asService("select id from public.claim_processing_job('w', $1, 300)", [u])).toHaveLength(0);
    expect(await asService("select id from public.claim_processing_job('w', $1, 30)", [u])).toHaveLength(1);
  });

  it("allows only one active job per material", async () => {
    const u = await createUser();
    await expect(
      asSuperuser(async (c) => {
        const m = await insertMaterial(c, u);
        await c.query("insert into public.document_processing_jobs (material_id, user_id) values ($1, $2), ($1, $2)", [m, u]);
      }),
    ).rejects.toThrow(/duplicate key/);
  });

  it("is not callable by students", async () => {
    const u = await createUser();
    await expect(
      asRole("authenticated", u, (c) => c.query("select * from public.claim_processing_job('x')")),
    ).rejects.toThrow(/permission denied/);
  });
});
