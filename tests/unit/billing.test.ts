import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { effectivePlan } from "@/lib/billing/entitlements";
import { limitTier, limitsFor } from "@/lib/billing/plans";
import { paystackEventToUpdate, stripeEventToUpdate, verifyPaystackSignature, verifyStripeSignature } from "@/lib/billing/webhooks";

const now = new Date("2026-11-20T12:00:00Z");

describe("entitlements", () => {
  it("grants premium only while paid for", () => {
    expect(effectivePlan(null)).toBe("free");
    expect(effectivePlan({ plan: "premium", status: "active", current_period_end: null }, now)).toBe("premium");
    expect(effectivePlan({ plan: "premium", status: "cancelled", current_period_end: "2026-12-01T00:00:00Z" }, now)).toBe("premium");
    expect(effectivePlan({ plan: "premium", status: "cancelled", current_period_end: "2026-11-01T00:00:00Z" }, now)).toBe("free");
    expect(effectivePlan({ plan: "premium", status: "past_due", current_period_end: null }, now)).toBe("free");
    expect(effectivePlan({ plan: "premium", status: "incomplete", current_period_end: "2027-01-01T00:00:00Z" }, now)).toBe("free");
    expect(effectivePlan({ plan: "free", status: "active", current_period_end: null }, now)).toBe("free");
  });
});

describe("webhook signatures", () => {
  const body = JSON.stringify({ id: "evt_1", type: "x" });
  it("verifies Stripe signatures and rejects tampering and replays", () => {
    const t = 1_800_000_000;
    const sig = createHmac("sha256", "whsec_test").update(`${t}.${body}`).digest("hex");
    expect(verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec_test", t + 10)).toBe(true);
    expect(verifyStripeSignature(body, `t=${t},v1=deadbeef,v1=${sig}`, "whsec_test", t)).toBe(true);
    expect(verifyStripeSignature(`${body} `, `t=${t},v1=${sig}`, "whsec_test", t)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec_other", t)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec_test", t + 3600)).toBe(false);
    expect(verifyStripeSignature(body, null, "whsec_test", t)).toBe(false);
  });
  it("verifies Paystack signatures", () => {
    const sig = createHmac("sha512", "sk_test").update(body).digest("hex");
    expect(verifyPaystackSignature(body, sig, "sk_test")).toBe(true);
    expect(verifyPaystackSignature(body, sig, "sk_live")).toBe(false);
    expect(verifyPaystackSignature(body, "zz", "sk_test")).toBe(false);
  });
});

describe("event mapping", () => {
  it("maps Stripe checkout and subscription lifecycle", () => {
    expect(
      stripeEventToUpdate({ type: "checkout.session.completed", data: { object: { mode: "subscription", client_reference_id: "u1", customer: "cus_1", subscription: "sub_1", payment_status: "paid" } } }),
    ).toMatchObject({ userId: "u1", customerId: "cus_1", subscriptionId: "sub_1", plan: "premium", status: "active" });
    expect(stripeEventToUpdate({ type: "checkout.session.completed", data: { object: { mode: "payment" } } })).toBeNull();
    const upd = stripeEventToUpdate({
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1", customer: "cus_1", status: "past_due", cancel_at_period_end: true, metadata: { user_id: "u1" }, items: { data: [{ current_period_end: 1_800_000_000, price: { id: "price_1", currency: "usd", unit_amount: 500, recurring: { interval: "month" } } }] } } },
    });
    expect(upd).toMatchObject({ status: "past_due", cancelAtPeriodEnd: true, currency: "USD", amountMinor: 500, interval: "month", currentPeriodEnd: new Date(1_800_000_000_000).toISOString() });
    expect(stripeEventToUpdate({ type: "customer.subscription.deleted", data: { object: { id: "sub_1", status: "active" } } })?.status).toBe("cancelled");
    expect(stripeEventToUpdate({ type: "invoice.payment_failed", data: { object: { subscription: "sub_1" } } })).toMatchObject({ status: "past_due" });
  });

  it("maps Paystack charge, subscription and cancellation", () => {
    expect(paystackEventToUpdate({ event: "charge.success", data: { amount: 350000, currency: "NGN", customer: { customer_code: "CUS_1", email: "a@b.c" }, plan: {}, metadata: {} } })).toBeNull();
    expect(
      paystackEventToUpdate({ event: "charge.success", data: { amount: 350000, currency: "NGN", customer: { customer_code: "CUS_1" }, plan: { plan_code: "PLN_1", interval: "monthly" }, metadata: JSON.stringify({ user_id: "u1" }) } }),
    ).toMatchObject({ userId: "u1", customerId: "CUS_1", status: "active", interval: "month", amountMinor: 350000 });
    expect(paystackEventToUpdate({ event: "subscription.create", data: { subscription_code: "SUB_1", email_token: "tok", status: "active", next_payment_date: "2026-12-20T00:00:00Z", customer: { customer_code: "CUS_1" }, plan: { plan_code: "PLN_1" } } })).toMatchObject({ subscriptionId: "SUB_1", emailToken: "tok", status: "active" });
    expect(paystackEventToUpdate({ event: "subscription.disable", data: { subscription_code: "SUB_1" } })).toMatchObject({ status: "cancelled" });
    expect(paystackEventToUpdate({ event: "subscription.not_renew", data: { subscription_code: "SUB_1" } })).toMatchObject({ cancelAtPeriodEnd: true });
  });
});


describe("guest limits", () => {
  it("gives guests their own, smaller limits regardless of plan", () => {
    expect(limitTier("free", true)).toBe("guest");
    expect(limitTier("premium", true)).toBe("guest");
    expect(limitTier("free", false)).toBe("free");
    expect(limitsFor("guest").aiMessagesPerDay).toBeLessThan(limitsFor("free").aiMessagesPerDay);
    expect(limitsFor("guest").maxMaterials).toBeLessThan(limitsFor("free").maxMaterials);
  });
});
