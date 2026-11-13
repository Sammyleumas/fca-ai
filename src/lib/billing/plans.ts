import type { SubscriptionPlan } from "@/types/db";

/** Limits apply per tier: guests (no account yet) get a smaller taste of the Free plan. */
export type LimitTier = SubscriptionPlan | "guest";

/** Single source of truth for plan limits. Enforced server-side only. */
export const PLAN_LIMITS = {
  guest: {
    label: "Guest",
    maxMaterials: 2,
    maxUploadBytes: 10 * 1024 * 1024,
    activeStudyPlans: 1,
    aiMessagesPerDay: 10,
    quizzesPerDay: 1,
    flashcardsPerMaterial: 15,
    advancedAnalytics: false,
  },
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
} as const satisfies Record<LimitTier, Record<string, unknown>>;

export type PlanLimits = (typeof PLAN_LIMITS)[LimitTier];

export function limitsFor(tier: LimitTier): PlanLimits {
  return PLAN_LIMITS[tier];
}

/** Guests always get guest limits (they can't pay without an account). */
export function limitTier(plan: SubscriptionPlan, isGuest: boolean): LimitTier {
  return isGuest ? "guest" : plan;
}
