import { afterAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, asRole, asSuperuser, closePool, insertMaterial } from "./helpers";

const d = TEST_DATABASE_URL ? describe : describe.skip;

async function createGuest(daysAgo = 0): Promise<string> {
  return asSuperuser(async (c) => {
    const r = await c.query<{ id: string }>(
      "insert into auth.users (email, is_anonymous, created_at, last_sign_in_at) values (null, true, now() - make_interval(days => $1), now() - make_interval(days => $1)) returning id",
      [daysAgo],
    );
    return r.rows[0].id;
  });
}

d("guest access (anonymous users)", () => {
  afterAll(closePool);

  it("bootstraps a profile, streak and free plan for a guest with no email", async () => {
    const g = await createGuest();
    const r = await asSuperuser((c) =>
      c.query(
        `select p.preferred_name, s.current_streak, sub.plan from public.profiles p
         join public.study_streaks s on s.user_id = p.id join public.subscriptions sub on sub.user_id = p.id where p.id = $1`,
        [g],
      ),
    );
    expect(r.rows[0]).toEqual({ preferred_name: null, current_streak: 0, plan: "free" });
  });

  it("keeps guests isolated from each other like any student", async () => {
    const a = await createGuest();
    const b = await createGuest();
    const m = await asRole("authenticated", a, (c) => insertMaterial(c, a), { commit: true });
    const seen = await asRole("authenticated", b, (c) => c.query("select id from public.materials where id = $1", [m]));
    expect(seen.rowCount).toBe(0);
  });

  it("lists only guests unused for the given number of days, for the service role only", async () => {
    const fresh = await createGuest(1);
    const stale = await createGuest(45);
    const ids = await asRole("service_role", null, (c) => c.query<{ id: string }>("select public.stale_guest_ids(30, 500) as id"));
    const list = ids.rows.map((r) => r.id);
    expect(list).toContain(stale);
    expect(list).not.toContain(fresh);
    await expect(asRole("authenticated", fresh, (c) => c.query("select public.stale_guest_ids(30, 10)"))).rejects.toThrow(/permission denied/);
  });
});
