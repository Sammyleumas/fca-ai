import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/dal";
import { billingProviders } from "@/lib/billing/config";
import { effectivePlan } from "@/lib/billing/entitlements";
import { createPaystackCheckout } from "@/lib/billing/providers/paystack";
import { createStripeCheckout } from "@/lib/billing/providers/stripe";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";

const schema = z.object({ provider: z.enum(["stripe", "paystack"]), interval: z.enum(["month", "year"]) });

/** Creates a hosted checkout. The plan only changes after the provider confirms payment. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (user.isGuest) return NextResponse.json({ error: "Save your account with an email before upgrading." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const provider = billingProviders().find((p) => p.id === parsed.data.provider);
  const price = provider?.prices[parsed.data.interval];
  if (!provider || !price || !hasAdminClient()) return NextResponse.json({ error: "This payment option isn't available yet." }, { status: 503 });
  if (!user.email) return NextResponse.json({ error: "Your account needs an email address to subscribe." }, { status: 400 });

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("check_rate_limit", { p_key: "billing:checkout", p_limit: 10, p_window_seconds: 3600 });
  if (allowed === false) return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });

  const { data: sub } = await createAdminClient()
    .from("subscriptions")
    .select("plan, status, current_period_end, provider, provider_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (sub && effectivePlan(sub) === "premium" && sub.status !== "cancelled") {
    return NextResponse.json({ error: "You already have Premium." }, { status: 409 });
  }

  const base = await siteUrl();
  try {
    const url =
      provider.id === "stripe"
        ? await createStripeCheckout({
            priceId: price.code,
            userId: user.id,
            email: user.email,
            customerId: sub?.provider === "stripe" ? (sub.provider_customer_id as string | null) : null,
            successUrl: `${base}/settings/billing?status=processing`,
            cancelUrl: `${base}/settings/billing?status=cancelled`,
          })
        : await createPaystackCheckout({ planCode: price.code, userId: user.id, email: user.email, callbackUrl: `${base}/api/billing/paystack/callback` });
    return NextResponse.json({ url });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "checkout failed", provider: provider.id, error: e instanceof Error ? e.message : String(e) }));
    return NextResponse.json({ error: "We couldn't start the checkout. Please try again." }, { status: 502 });
  }
}
