import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/dal";
import { AuthHeader } from "@/components/auth/auth-header";
import { GuestButton } from "@/components/auth/guest-button";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage() {
  // Guests keep their work by saving their guest account instead of signing up afresh.
  if ((await getSessionUser())?.isGuest) redirect("/account/save");
  return (
    <>
      <AuthHeader title="Create your account" subtitle="Start studying smarter in under a minute." />
      <SignupForm />
      <OAuthButtons next="/onboarding" />
      <GuestButton size="md" className="mt-4" />
      <p className="mt-8 text-center text-sm text-fg-2">
        Already have an account?{" "}
        <Link href="/login" className="focus-ring rounded font-semibold text-accent hover:underline">
          Sign In
        </Link>
      </p>
    </>
  );
}
