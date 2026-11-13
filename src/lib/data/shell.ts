import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SubscriptionPlan } from "@/types/db";
import { effectivePlan, type SubscriptionState } from "@/lib/billing/entitlements";

export async function getShellData(userId: string): Promise<{ unread: number; plan: SubscriptionPlan }> {
  const supabase = await createClient();
  // Time-zone-aware reminders work even without a scheduled job: refresh them at
  // most every 15 minutes when the student opens the app.
  const { data: due } = await supabase.rpc("check_rate_limit", { p_key: "notifications:refresh", p_limit: 1, p_window_seconds: 900 });
  if (due) await supabase.rpc("refresh_my_notifications");
  const [notif, sub] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null)
      .lte("scheduled_for", new Date().toISOString()),
    supabase.from("subscriptions").select("plan, status, current_period_end").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    unread: notif.count ?? 0,
    plan: effectivePlan((sub.data as SubscriptionState | null) ?? null),
  };
}
