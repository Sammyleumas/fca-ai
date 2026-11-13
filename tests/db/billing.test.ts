import { afterAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, asRole, asSuperuser, closePool, createUser } from "./helpers";

const d = TEST_DATABASE_URL ? describe : describe.skip;

d("billing security", () => {
  afterAll(closePool);

  it("hides provider tokens and ids from students and keeps the webhook ledger private", async () => {
    const u = await createUser();
    await asSuperuser((c) => c.query("update public.subscriptions set provider = 'paystack', provider_email_token = 'secret' where user_id = $1", [u]));
    await expect(asRole("authenticated", u, (c) => c.query("select provider_email_token from public.subscriptions"))).rejects.toThrow(/permission denied/);
    await expect(asRole("authenticated", u, (c) => c.query("select provider_customer_id from public.subscriptions"))).rejects.toThrow(/permission denied/);
    const ok = await asRole("authenticated", u, (c) => c.query("select plan, status, provider from public.subscriptions"));
    expect(ok.rows).toEqual([{ plan: "free", status: "active", provider: "paystack" }]);
    await expect(asRole("authenticated", u, (c) => c.query("select * from public.billing_events"))).rejects.toThrow(/permission denied/);
    await expect(asRole("authenticated", u, (c) => c.query("update public.subscriptions set plan = 'premium'"))).rejects.toThrow(/permission denied/);
  });

  it("does not let students look users up by email", async () => {
    const u = await createUser();
    await expect(asRole("authenticated", u, (c) => c.query("select public.user_id_by_email('x@y.z')"))).rejects.toThrow(/permission denied/);
  });

  it("records each webhook event once", async () => {
    await expect(
      asSuperuser(async (c) => {
        await c.query("insert into public.billing_events (provider, event_id, event_type) values ('stripe', 'evt_1', 't')");
        await c.query("insert into public.billing_events (provider, event_id, event_type) values ('stripe', 'evt_1', 't')");
      }),
    ).rejects.toThrow(/duplicate key/);
  });

  it("applies provider events atomically, in order, with a grace period for failed renewals", async () => {
    const u = await createUser();
    const apply = (at: string, args: string) =>
      asRole("service_role", null, (c) => c.query(`select public.apply_subscription_update($1, 'stripe', $2::timestamptz, ${args}) as ok`, [u, at]), { commit: true });
    const row = () => asSuperuser((c) => c.query("select plan, status, provider_subscription_id, current_period_end, grace_until from public.subscriptions where user_id = $1", [u]));

    expect((await apply("2026-11-20T10:00:00Z", "p_plan => 'premium', p_status => 'active', p_subscription_id => 'sub_1', p_period_end => '2026-12-20T00:00:00Z'")).rows[0].ok).toBe(true);
    // An older event arriving late is ignored and changes nothing.
    expect((await apply("2026-11-20T09:00:00Z", "p_status => 'incomplete'")).rows[0].ok).toBe(false);
    expect((await row()).rows[0]).toMatchObject({ plan: "premium", status: "active", provider_subscription_id: "sub_1" });
    // A failed renewal starts a ~7-day grace period; fields not in the event are kept.
    await apply("2026-11-21T10:00:00Z", "p_status => 'past_due', p_period_end => '2027-01-20T00:00:00Z'");
    const r = (await row()).rows[0];
    expect(r.status).toBe("past_due");
    expect(r.provider_subscription_id).toBe("sub_1");
    const graceDays = (new Date(r.grace_until).getTime() - Date.now()) / 86_400_000;
    expect(graceDays).toBeGreaterThan(6.9);
    expect(graceDays).toBeLessThan(7.1);
    // Recovery clears the grace period.
    await apply("2026-11-22T10:00:00Z", "p_status => 'active'");
    expect((await row()).rows[0].grace_until).toBeNull();
    // Students can't call it.
    await expect(asRole("authenticated", u, (c) => c.query("select public.apply_subscription_update($1, 'stripe', now(), 'premium', 'active')", [u]))).rejects.toThrow(/permission denied/);
  });
});
