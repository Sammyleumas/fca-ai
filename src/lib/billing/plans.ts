import type { SubscriptionPlan } from "@/types/db";

/** Single source of truth for plan limits. Enforced server-side only. */
export const PLAN_LIMITS = {
  free: {
    label: "Free",
    maxMaterials: 5,
    maxUploadBytes: 25 * 1024 * 1024,
    activeStudyPlans: 2,
    aiMessagesPerDay: 20,
    quizzesPerDay: 3,
    flashcardsPerMaterial: 30,
    advancedAnalytics: false,
  },
  premium: {
    label: "Premium",
    maxMaterials: 200,
    maxUploadBytes: 100 * 1024 * 1024,
    activeStudyPlans: 20,
    aiMessagesPerDay: 300,
    quizzesPerDay: 30, // fair-use ceiling
    flashcardsPerMaterial: 300,
    advancedAnalytics: true,
  },
} as const satisfies Record<SubscriptionPlan, Record<string, unknown>>;

export type PlanLimits = (typeof PLAN_LIMITS)[SubscriptionPlan];

export function limitsFor(plan: SubscriptionPlan): PlanLimits {
  return PLAN_LIMITS[plan];
}
