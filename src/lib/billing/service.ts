import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProviderId } from "./config";
import type { SubscriptionUpdate } from "./webhooks";

/** Days of Premium kept after a failed renewal while the provider retries the payment. */
export const PAST_DUE_GRACE_DAYS = 7;

/**
 * Applies a verified provider update to the student's subscription row.
 *  - finds the student by id, provider subscription id, customer id, then email
 *  - ignores events older than the last one applied (out-of-order delivery)
 * Returns the user id it applied to, or null if no student could be matched.
 */
export async function applySubscriptionUpdate(provider: ProviderId, u: SubscriptionUpdate, eventTime: Date): Promise<string | null> {
  const admin = createAdminClient();
  let userId = u.userId ?? null;
  if (!userId && u.subscriptionId) {
    const { data } = await admin.from("subscriptions").select("user_id").eq("provider", provider).eq("provider_subscription_id", u.subscriptionId).maybeSingle();
    userId = (data?.user_id as string | undefined) ?? null;
  }
  if (!userId && u.customerId) {
    const { data } = await admin.from("subscriptions").select("user_id").eq("provider", provider).eq("provider_customer_id", u.customerId).maybeSingle();
    userId = (data?.user_id as string | undefined) ?? null;
  }
  if (!userId && u.email) {
    const { data } = await admin.rpc("user_id_by_email", { p_email: u.email });
    userId = (data as string | null) ?? null;
  }
  if (!userId) return null;

  // Atomic and order-safe: one SQL call locks the row, skips stale events and merges fields.
  const { data: applied, error } = await admin.rpc("apply_subscription_update", {
    p_user_id: userId,
    p_provider: provider,
    p_event_at: eventTime.toISOString(),
    p_plan: u.plan ?? null,
    p_status: u.status ?? null,
    p_customer_id: u.customerId ?? null,
    p_subscription_id: u.subscriptionId ?? null,
    p_period_end: u.currentPeriodEnd ?? null,
    p_cancel_at_period_end: u.cancelAtPeriodEnd ?? null,
    p_currency: u.currency ?? null,
    p_interval: u.interval ?? null,
    p_amount_minor: u.amountMinor ?? null,
    p_plan_code: u.planCode ?? null,
    p_email_token: u.emailToken ?? null,
    p_grace_days: PAST_DUE_GRACE_DAYS,
  });
  if (error) throw new Error(`subscription update failed: ${error.message}`);
  if (!applied) return userId; // older than what we already have

  if (u.status === "past_due") {
    await admin.from("notifications").insert({
      user_id: userId,
      kind: "system",
      title: "Payment problem",
      body: "We couldn't renew your Premium subscription. Update your payment details to keep Premium.",
      link: "/settings/billing",
    });
  }
  return userId;
}

/** Records a webhook event once. Returns false if it was already processed. */
export async function claimEvent(provider: ProviderId, eventId: string, eventType: string): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.from("billing_events").insert({ provider, event_id: eventId.slice(0, 200), event_type: eventType.slice(0, 100) });
  if (!error) return true;
  if (error.code === "23505") {
    // Already received. If an earlier attempt crashed mid-way (never finished) more than
    // 5 minutes ago, take it over so the provider's retry is processed, not dropped.
    const { data } = await admin
      .from("billing_events")
      .update({ received_at: new Date().toISOString() })
      .eq("provider", provider)
      .eq("event_id", eventId.slice(0, 200))
      .is("processed_at", null)
      .lt("received_at", new Date(Date.now() - 5 * 60_000).toISOString())
      .select("id");
    return Boolean(data?.length);
  }
  throw new Error(`could not record billing event: ${error.message}`);
}

export async function finishEvent(provider: ProviderId, eventId: string, userId: string | null, error?: string) {
  await createAdminClient()
    .from("billing_events")
    .update({ processed_at: new Date().toISOString(), user_id: userId, error: error ?? null })
    .eq("provider", provider)
    .eq("event_id", eventId.slice(0, 200));
}
