import type { Metadata } from "next";
import { Check, Info } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { FormMessage } from "@/components/ui/feedback";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { getShellData } from "@/lib/data/shell";
import { PLAN_LIMITS } from "@/lib/billing/plans";
import { formatBytes } from "@/lib/utils/format";
import { cn } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Plans" };

export default async function BillingPage() {
  const { user } = await requireOnboardedUser();
  const { plan } = await getShellData(user.id);
  const rows = (p: keyof typeof PLAN_LIMITS) => {
    const l = PLAN_LIMITS[p];
    return [
      `${l.maxMaterials} learning materials`,
      `Files up to ${formatBytes(l.maxUploadBytes)}`,
      `${l.activeStudyPlans} active study plans`,
      `${l.aiMessagesPerDay} AI tutor messages / day`,
      `${l.quizzesPerDay} AI quizzes / day${p === "premium" ? " (fair use)" : ""}`,
      l.advancedAnalytics ? "Advanced analytics" : "Core analytics",
    ];
  };
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Plans</h1>
      <FormMessage tone="info">
        Payments (Paystack for Nigeria, Stripe internationally) launch in build phase 7. Until then every account is on the
        Free plan and no payment is taken.
      </FormMessage>
      <div className="grid gap-5 md:grid-cols-2">
        {(["free", "premium"] as const).map((p) => (
          <GlassCard key={p} className={cn("p-6", p === "premium" && "border-accent/40")}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{PLAN_LIMITS[p].label}</h2>
              {plan === p && <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">Current plan</span>}
            </div>
            <ul className="mt-5 space-y-2.5">
              {rows(p).map((r) => (
                <li key={r} className="flex items-center gap-2.5 text-sm text-fg-2">
                  <Check className="size-4 shrink-0 text-accent" aria-hidden="true" /> {r}
                </li>
              ))}
            </ul>
            {p === "premium" && plan !== "premium" && (
              <p className="mt-6 flex items-center gap-2 rounded-xl border border-line bg-white/[0.03] px-3.5 py-2.5 text-sm text-fg-2">
                <Info className="size-4 shrink-0" aria-hidden="true" /> Upgrading becomes available when billing launches.
              </p>
            )}
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
