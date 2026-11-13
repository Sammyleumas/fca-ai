import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { limitsFor } from "@/lib/billing/plans";
import { getShellData } from "@/lib/data/shell";
import { AIError, type AIUsage } from "./types";

export type AIFeature = "tutor_chat" | "segmentation" | "study_plan" | "quiz" | "grading" | "flashcards" | "explain";

/**
 * Entitlement + rate limiting before any AI call:
 *  - burst limit: 8 requests / minute per student (Postgres fixed window),
 *  - daily quota from the student's plan (counted from ai_usage_events).
 */
export async function assertAIAllowed(userId: string, feature: AIFeature): Promise<void> {
  const supabase = await createClient();
  const { data: allowed, error } = await supabase.rpc("check_rate_limit", {
    p_key: `ai:${feature}`,
    p_limit: 8,
    p_window_seconds: 60,
  });
  if (error) throw new AIError("unavailable", "Could not verify your usage. Please try again.");
  if (allowed === false) throw new AIError("rate_limited", "You're sending messages quickly. Please wait a moment.");

  if (feature === "tutor_chat" || feature === "explain") {
    const { plan } = await getShellData(userId);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("feature", ["tutor_chat", "explain"])
      .gte("created_at", since);
    if ((count ?? 0) >= limitsFor(plan).aiMessagesPerDay) {
      throw new AIError(
        "quota_exceeded",
        `You've reached today's limit of ${limitsFor(plan).aiMessagesPerDay} AI messages on the ${limitsFor(plan).label} plan.`,
      );
    }
  }
}

/** Metering rows are written with the service role (students cannot edit them). */
export async function recordAIUsage(userId: string, feature: AIFeature, usage: AIUsage): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("ai_usage_events").insert({
    user_id: userId,
    feature,
    model: usage.model,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
  });
  if (error) console.error("ai usage metering failed", error.code);
}
