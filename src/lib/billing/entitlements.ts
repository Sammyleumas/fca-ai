import type { SubscriptionPlan } from "@/types/db";

export type SubscriptionState = {
  plan: SubscriptionPlan;
  status: "active" | "trialing" | "past_due" | "cancelled" | "incomplete";
  current_period_end: string | null;
  /** Set when a renewal fails: Premium is kept until then while the provider retries. */
  grace_until?: string | null;
};

/**
 * Premium is granted while a subscription is active/trialing; after a cancellation
 * only until the end of the period already paid for; after a failed renewal only
 * for a short grace period (the provider's "period end" then points at the new,
 * unpaid period). Everything else is Free. Evaluated on the server only.
 */
export function effectivePlan(sub: SubscriptionState | null, now = new Date()): SubscriptionPlan {
  if (!sub || sub.plan !== "premium") return "free";
  if (sub.status === "active" || sub.status === "trialing") return "premium";
  const until = sub.status === "past_due" ? sub.grace_until : sub.status === "cancelled" ? sub.current_period_end : null;
  if (until) return new Date(until).getTime() > now.getTime() ? "premium" : "free";
  return "free";
}
