import Link from "next/link";
import type { Metadata } from "next";
import { Check, Info } from "lucide-react";
import { ManageSubscription, UpgradeOptions, type ProviderOption } from "@/components/settings/billing-controls";
import { FormMessage } from "@/components/ui/feedback";
import { GlassCard } from "@/components/ui/glass-card";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { buttonClasses } from "@/components/ui/button";
import { billingProviders } from "@/lib/billing/config";
import { effectivePlan, type SubscriptionState } from "@/lib/billing/entitlements";
import { PLAN_LIMITS } from "@/lib/billing/plans";
import { createClient } from "@/lib/supabase/server";
import { cn, formatBytes } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Plans" };

const STATUS: Record<string, string | undefined> = {
  success: "Payment confirmed — welcome to Premium!",
  processing: "We're confirming your payment with the provider. This usually takes a few seconds — refresh shortly.",
  cancelled: "Checkout was cancelled. You haven't been charged.",
  failed: "We couldn't confirm that payment. If you were charged, it will be applied automatically once the provider confirms it.",
};

export default async function BillingPage({ searchParams }: PageProps<"/settings/billing">) {
  const { user, profile } = await requireOnboardedUser();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan, status, provider, current_period_end, grace_until, cancel_at_period_end, currency, billing_interval, amount_minor")
    .eq("user_id", user.id)
    .maybeSingle();
  const plan = effectivePlan((sub as SubscriptionState | null) ?? null);
  const providers: ProviderOption[] = billingProviders().map((p) => ({
    id: p.id,
    label: p.label,
    currencyLabel: p.currencyLabel,
    prices: (Object.entries(p.prices) as [("month" | "year"), { display: string | null }][]).map(([interval, v]) => ({ interval, display: v.display })),
  }));
  const preferred = profile.timezone === "Africa/Lagos" ? "paystack" : "stripe";
  const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: profile.timezone });
  const notice = typeof sp.status === "string" ? STATUS[sp.status] : undefined;
  const rows = (p: keyof typeof PLAN_LIMITS) => {
    const l = PLAN_LIMITS[p];
    return [
      `${l.maxMaterials} learning materials`,
      `Files up to ${formatBytes(l.maxUploadBytes)}`,
      `${l.activeStudyPlans} active study plans`,
      `${l.aiMessagesPerDay} AI tutor & reading-assistant messages / day`,
      `${l.quizzesPerDay} AI quizzes / day${p === "premium" ? " (fair use)" : ""}`,
      `${l.flashcardsPerMaterial} AI flashcards per material`,
      l.advancedAnalytics ? "Advanced analytics" : "Core analytics",
    ];
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Plans</h1>
      {notice && <FormMessage tone={sp.status === "success" ? "success" : sp.status === "failed" ? "error" : "info"}>{notice}</FormMessage>}

      {sub && sub.provider !== "none" && (
        <GlassCard className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="font-semibold">Premium via {sub.provider === "stripe" ? "Stripe" : "Paystack"} · {sub.status.replace("_", " ")}</p>
            <p className="text-sm text-fg-2">
              {sub.status === "past_due"
                ? `Your last payment failed. ${sub.grace_until && new Date(sub.grace_until) > new Date() ? `Premium stays on until ${dateFmt.format(new Date(sub.grace_until))} while we retry — ` : ""}update your payment details to keep Premium.`
                : sub.current_period_end
                ? sub.cancel_at_period_end || sub.status === "cancelled"
                  ? `Premium ends on ${dateFmt.format(new Date(sub.current_period_end))}.`
                  : `Renews on ${dateFmt.format(new Date(sub.current_period_end))}.`
                : "Waiting for the first billing period from the provider."}
            </p>
          </div>
          <ManageSubscription />
        </GlassCard>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {(["free", "premium"] as const).map((p) => (
          <GlassCard key={p} className={cn("p-6", p === "premium" && "border-accent/40")}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{PLAN_LIMITS[p].label}</h2>
              {plan === p && <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">Current plan</span>}
            </div>
            <ul className="mt-5 space-y-2.5">
              {rows(p).map((r) => (
                <li key={r} className="flex items-center gap-2.5 text-sm text-fg-2"><Check className="size-4 shrink-0 text-accent" aria-hidden="true" /> {r}</li>
              ))}
            </ul>
            {p === "premium" && plan !== "premium" && (
              <div className="mt-6">
                {user.isGuest ? (
                  <Link href="/account/save" className={buttonClasses({ className: "w-full" })}>
                    Save your account to upgrade
                  </Link>
                ) : providers.length ? (
                  <UpgradeOptions providers={providers} preferred={preferred} />
                ) : (
                  <p className="flex items-center gap-2 rounded-xl border border-line bg-white/[0.03] px-3.5 py-2.5 text-sm text-fg-2">
                    <Info className="size-4 shrink-0" aria-hidden="true" /> Payments aren&apos;t configured on this server yet.
                  </p>
                )}
              </div>
            )}
          </GlassCard>
        ))}
      </div>
      <p className="text-xs text-muted">Prices are shown by the payment provider at checkout. Plan limits are enforced on our servers.</p>
    </div>
  );
}
