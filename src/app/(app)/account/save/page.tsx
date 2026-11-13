import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { SaveGuestAccountForm } from "@/components/auth/simple-forms";
import { GlassCard } from "@/components/ui/glass-card";
import { requireOnboardedUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Save your account" };

export default async function SaveAccountPage() {
  const { user } = await requireOnboardedUser();
  if (!user.isGuest) redirect("/settings");
  return (
    <div className="mx-auto max-w-xl space-y-5 pt-2">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Save your account</h1>
        <p className="mt-1 text-sm text-fg-2">You&apos;re using FCA-AI as a guest. Add an email and a password to keep everything you&apos;ve done.</p>
      </div>
      <GlassCard className="p-5 sm:p-6">
        <ol className="mb-5 space-y-2 text-sm text-fg-2">
          {["Enter your email and we'll send a confirmation link.", "Open the link, then choose a password.", "Your materials, plans, quizzes and progress stay exactly as they are."].map((t, i) => (
            <li key={t} className="flex gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-black">{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
        <SaveGuestAccountForm />
      </GlassCard>
      <p className="flex items-start gap-2 text-xs text-muted">
        <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
        Guest work lives only in this browser session. If you sign out or clear your browser data before saving, it can&apos;t be recovered, and unused guest sessions are deleted after 30 days.
      </p>
    </div>
  );
}
