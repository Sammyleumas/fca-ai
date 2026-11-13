import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Crown, LogOut } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { DataForm, LearningForm, NotificationsForm, PasswordForm, ProfileForm } from "@/components/settings/settings-forms";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { getShellData } from "@/lib/data/shell";
import { notificationPrefsSchema } from "@/lib/validation/profile";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, profile } = await requireOnboardedUser();
  const { plan } = await getShellData(user.id);
  const prefs = notificationPrefsSchema.parse(profile.notification_prefs ?? {});
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <nav aria-label="Settings sections" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 text-sm">
        {[["profile", "Profile"], ["learning", "Learning"], ["notifications", "Notifications"], ["security", "Password"], ["privacy", "Privacy & data"]].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="focus-ring glass shrink-0 rounded-full px-4 py-2 text-fg-2 hover:text-fg">{label}</a>
        ))}
      </nav>
      <Link href="/settings/billing" className="focus-ring block rounded-[var(--radius-glass)]">
        <GlassCard className="flex items-center gap-4 p-5 transition hover:border-accent/40">
          <Crown className="size-6 text-warning" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold">Plan: {plan === "premium" ? "Premium" : "Free"}</p>
            <p className="text-sm text-fg-2">View limits and plan options</p>
          </div>
          <ArrowRight className="size-4 text-fg-2" aria-hidden="true" />
        </GlassCard>
      </Link>
      <ProfileForm profile={profile} email={user.email} />
      <LearningForm profile={profile} />
      <NotificationsForm prefs={prefs} />
      <PasswordForm />
      <DataForm />
      <form action="/auth/signout" method="post" className="md:hidden">
        <button type="submit" className="focus-ring glass flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-fg-2">
          <LogOut className="size-4" aria-hidden="true" /> Sign out
        </button>
      </form>
    </div>
  );
}
