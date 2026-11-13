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
});
