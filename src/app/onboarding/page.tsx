import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SilkBackground } from "@/components/brand/silk-background";
import { Logo } from "@/components/brand/logo";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { getProfile, requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Set up your study space" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (profile?.onboarding_completed_at) redirect("/dashboard");
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <SilkBackground />
      <div className="relative mx-auto flex min-h-dvh max-w-xl flex-col px-4 py-6 sm:px-6 sm:py-10">
        <Logo className="mb-8" />
        <main id="main" className="flex flex-1 flex-col">
          <OnboardingFlow initialName={profile?.preferred_name ?? ""} />
        </main>
      </div>
    </div>
  );
}
