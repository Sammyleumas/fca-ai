import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/dal";
import { paystackManageLink } from "@/lib/billing/providers/paystack";
import { createStripePortal } from "@/lib/billing/providers/stripe";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site-url";

/** Opens the provider's hosted page to update the card or cancel. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!hasAdminClient()) return NextResponse.json({ error: "Billing isn't configured." }, { status: 503 });
  const { data: sub } = await createAdminClient()
    .from("subscriptions")
    .select("provider, provider_customer_id, provider_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();
  try {
    if (sub?.provider === "stripe" && sub.provider_customer_id) {
      return NextResponse.json({ url: await createStripePortal(sub.provider_customer_id as string, `${await siteUrl()}/settings/billing`) });
    }
    if (sub?.provider === "paystack" && sub.provider_subscription_id) {
      return NextResponse.json({ url: await paystackManageLink(sub.provider_subscription_id as string) });
    }
    return NextResponse.json({ error: "No paid subscription to manage." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "We couldn't open subscription management. Please try again." }, { status: 502 });
  }
}
