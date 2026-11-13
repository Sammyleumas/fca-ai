import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SubscriptionPlan } from "@/types/db";

export async function getShellData(userId: string): Promise<{ unread: number; plan: SubscriptionPlan }> {
  const supabase = await createClient();
  const [notif, sub] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null)
      .lte("scheduled_for", new Date().toISOString()),
    supabase.from("subscriptions").select("plan, status").eq("user_id", userId).maybeSingle(),
  ]);
  const active = sub.data && ["active", "trialing"].includes(sub.data.status as string);
  return {
    unread: notif.count ?? 0,
    plan: active && sub.data?.plan === "premium" ? "premium" : "free",
  };
}
