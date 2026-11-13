import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProviderId } from "./config";
import type { SubscriptionUpdate } from "./webhooks";

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

  const { data: current } = await admin.from("subscriptions").select("last_event_at, provider").eq("user_id", userId).maybeSingle();
  if (current?.last_event_at && new Date(current.last_event_at as string) > eventTime && current.provider === provider) return userId;

  const patch: Record<string, unknown> = { provider, last_event_at: eventTime.toISOString() };
  if (u.plan) patch.plan = u.plan;
  if (u.status) patch.status = u.status;
  if (u.customerId) patch.provider_customer_id = u.customerId;
  if (u.subscriptionId) patch.provider_subscription_id = u.subscriptionId;
  if (u.currentPeriodEnd !== undefined && u.currentPeriodEnd !== null) patch.current_period_end = u.currentPeriodEnd;
  if (u.cancelAtPeriodEnd !== undefined) patch.cancel_at_period_end = u.cancelAtPeriodEnd;
  if (u.currency) patch.currency = u.currency.toUpperCase();
  if (u.interval) patch.billing_interval = u.interval;
  if (u.amountMinor !== undefined && u.amountMinor !== null) patch.amount_minor = u.amountMinor;
  if (u.planCode) patch.provider_plan_code = u.planCode;
  if (u.emailToken) patch.provider_email_token = u.emailToken;

  const { error } = await admin.from("subscriptions").upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
  if (error) throw new Error(`subscription update failed: ${error.message}`);

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
  if (error.code === "23505") return false;
  throw new Error(`could not record billing event: ${error.message}`);
}

export async function finishEvent(provider: ProviderId, eventId: string, userId: string | null, error?: string) {
  await createAdminClient()
    .from("billing_events")
    .update({ processed_at: new Date().toISOString(), user_id: userId, error: error ?? null })
    .eq("provider", provider)
    .eq("event_id", eventId.slice(0, 200));
}
