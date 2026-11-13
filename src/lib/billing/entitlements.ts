import type { SubscriptionPlan } from "@/types/db";

export type SubscriptionState = {
  plan: SubscriptionPlan;
  status: "active" | "trialing" | "past_due" | "cancelled" | "incomplete";
  current_period_end: string | null;
};

/**
 * Premium is granted while a subscription is active/trialing, and — after a
 * cancellation or a failed renewal — only until the end of the period already
 * paid for. Everything else is Free. Evaluated on the server only.
 */
export function effectivePlan(sub: SubscriptionState | null, now = new Date()): SubscriptionPlan {
  if (!sub || sub.plan !== "premium") return "free";
  if (sub.status === "active" || sub.status === "trialing") return "premium";
  if ((sub.status === "past_due" || sub.status === "cancelled") && sub.current_period_end) {
    return new Date(sub.current_period_end).getTime() > now.getTime() ? "premium" : "free";
  }
  return "free";
}
