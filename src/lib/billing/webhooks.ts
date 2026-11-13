import { createHmac, timingSafeEqual } from "node:crypto";

/** Constant-time comparison of two hex digests. */
function safeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/**
 * Stripe: header "t=TIMESTAMP,v1=SIG[,v1=SIG2]" where SIG = HMAC-SHA256(secret, `${t}.${rawBody}`).
 * Rejects stale timestamps (replay protection).
 */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length || Math.abs(nowSeconds - t) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return sigs.some((s) => safeEqualHex(s, expected));
}

/** Paystack: header x-paystack-signature = HMAC-SHA512(secretKey, rawBody). */
export function verifyPaystackSignature(rawBody: string, header: string | null, secretKey: string): boolean {
  if (!header || !secretKey) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  return safeEqualHex(header, expected);
}

export type SubscriptionUpdate = {
  userId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  email?: string | null;
  plan?: "free" | "premium";
  status?: "active" | "trialing" | "past_due" | "cancelled" | "incomplete";
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  currency?: string | null;
  interval?: "month" | "year" | null;
  amountMinor?: number | null;
  planCode?: string | null;
  emailToken?: string | null;
};

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const iso = (unixSeconds: number | null) => (unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null);

const STRIPE_STATUS: Record<string, SubscriptionUpdate["status"]> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  // Retries exhausted: access ends now (handled below), not at the unpaid period's end.
  unpaid: "cancelled",
  canceled: "cancelled",
  incomplete: "incomplete",
  // The first payment never succeeded: never Premium.
  incomplete_expired: "incomplete",
  paused: "past_due",
};

/** Maps a verified Stripe event to a subscription update (null = not relevant). */
export function stripeEventToUpdate(event: { type: string; data: { object: unknown } }): SubscriptionUpdate | null {
  const obj = o(event.data.object);
  switch (event.type) {
    case "checkout.session.completed": {
      if (obj.mode !== "subscription") return null;
      return {
        userId: s(obj.client_reference_id) ?? s(o(obj.metadata).user_id),
        customerId: s(obj.customer),
        subscriptionId: s(obj.subscription),
        email: s(o(obj.customer_details).email),
        plan: "premium",
        // Payment collected for a subscription checkout; period details follow in subscription events.
        status: obj.payment_status === "paid" || obj.payment_status === "no_payment_required" ? "active" : "incomplete",
      };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const item = o((o(obj.items).data as unknown[] | undefined)?.[0]);
      const price = o(item.price);
      const status = event.type === "customer.subscription.deleted" ? "cancelled" : (STRIPE_STATUS[s(obj.status) ?? ""] ?? "incomplete");
      // Once a subscription has ended (deleted / canceled / unpaid), Premium stops when it ended —
      // its current_period_end may point at a period that was never paid for.
      const ended = status === "cancelled" && (event.type === "customer.subscription.deleted" || s(obj.status) !== "active");
      const periodEnd = ended
        ? (iso(n(obj.ended_at)) ?? new Date().toISOString())
        : iso(n(item.current_period_end) ?? n(obj.current_period_end));
      return {
        userId: s(o(obj.metadata).user_id),
        customerId: s(obj.customer),
        subscriptionId: s(obj.id),
        plan: "premium",
        status,
        // Newer API versions put the period on the item; older ones on the subscription.
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end),
        currency: s(price.currency)?.toUpperCase() ?? null,
        interval: (s(o(price.recurring).interval) as "month" | "year" | null) ?? null,
        amountMinor: n(price.unit_amount),
        planCode: s(price.id),
      };
    }
    case "invoice.payment_failed": {
      const sub = s(obj.subscription) ?? s(o(o(obj.parent).subscription_details).subscription);
      return sub ? { subscriptionId: sub, customerId: s(obj.customer), status: "past_due" } : null;
    }
    default:
      return null;
  }
}

/**
 * Maps a verified Paystack event to a subscription update (null = not relevant).
 * `allowedPlanCodes` are our configured Premium plans: a charge only grants Premium
 * if it was for one of them, at no less than the plan's price.
 */
export function paystackEventToUpdate(event: { event: string; data: unknown }, allowedPlanCodes: string[]): SubscriptionUpdate | null {
  const d = o(event.data);
  const customer = o(d.customer);
  const plan = typeof d.plan === "string" ? { plan_code: d.plan } : o(d.plan);
  const meta = o(typeof d.metadata === "string" ? safeJson(d.metadata) : d.metadata);
  const interval = (p: unknown) => (p === "annually" ? "year" : p === "monthly" ? "month" : null);
  switch (event.event) {
    case "charge.success": {
      // Only a charge for one of our Premium plans counts (metadata is payer-controlled, so it's ignored here).
      const code = s(plan.plan_code);
      if (!code || !allowedPlanCodes.includes(code)) return null;
      const planAmount = n(plan.amount);
      if (planAmount !== null && (n(d.amount) ?? 0) < planAmount) return null;
      return {
        userId: s(meta.user_id),
        customerId: s(customer.customer_code),
        email: s(customer.email),
        plan: "premium",
        status: "active",
        currency: s(d.currency),
        amountMinor: n(d.amount),
        planCode: code,
        interval: interval(plan.interval),
      };
    }
    case "subscription.create":
      return {
        customerId: s(customer.customer_code),
        email: s(customer.email),
        subscriptionId: s(d.subscription_code),
        emailToken: s(d.email_token),
        plan: "premium",
        status: s(d.status) === "active" ? "active" : "incomplete",
        currentPeriodEnd: s(d.next_payment_date),
        planCode: s(plan.plan_code),
        currency: s(plan.currency),
        amountMinor: n(plan.amount) ?? n(d.amount),
        interval: interval(plan.interval),
        cancelAtPeriodEnd: false,
      };
    case "subscription.not_renew":
      return { subscriptionId: s(d.subscription_code), customerId: s(customer.customer_code), cancelAtPeriodEnd: true, currentPeriodEnd: s(d.next_payment_date) };
    case "subscription.disable":
      // Paystack disables a subscription when it ends (after "not renewing", failed retries or a cancel): access stops now.
      return { subscriptionId: s(d.subscription_code), customerId: s(customer.customer_code), status: "cancelled", cancelAtPeriodEnd: true, currentPeriodEnd: new Date().toISOString() };
    case "invoice.payment_failed":
      return { subscriptionId: s(o(d.subscription).subscription_code), customerId: s(customer.customer_code), status: "past_due" };
    default:
      return null;
  }
}

function safeJson(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return {};
  }
}
