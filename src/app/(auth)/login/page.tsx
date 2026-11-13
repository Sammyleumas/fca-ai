import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeader } from "@/components/auth/auth-header";
import { LoginForm } from "@/components/auth/login-form";
import { GuestButton } from "@/components/auth/guest-button";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { FormMessage } from "@/components/ui/feedback";
import { safeNextPath } from "@/lib/routes";
import { getSessionUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  link_expired: "That link is invalid or has expired. Please request a new one.",
  oauth_failed: "We couldn't complete sign-in with that provider. Please try again.",
  oauth_unavailable: "That sign-in provider isn't available yet. Please use email and password.",
  provider: "Unknown sign-in provider.",
  profile_missing: "We couldn't find your profile. Please sign in again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeNextPath(sp.next) : undefined;
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;
  const isGuest = (await getSessionUser())?.isGuest ?? false;
  return (
    <>
      <AuthHeader title={<>Welcome Back <span aria-hidden="true">👋</span></>} subtitle="Sign in to continue your learning journey" />
      {error && <FormMessage className="mb-4">{error}</FormMessage>}
      {isGuest && (
        <FormMessage tone="info" className="mb-4">
          You&apos;re using FCA-AI as a guest. Signing in to another account leaves this guest work behind —{" "}
          <Link href="/account/save" className="font-semibold text-accent hover:underline">save it to an account</Link> first if you want to keep it.
        </FormMessage>
      )}
      {sp.signed_out && <FormMessage tone="success" className="mb-4">You have been signed out.</FormMessage>}
      <LoginForm next={next} />
      <OAuthButtons next={next} />
      <GuestButton size="md" className="mt-4" />
      <p className="mt-8 text-center text-sm text-fg-2">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="focus-ring rounded font-semibold text-accent hover:underline">
          Sign Up
        </Link>
      </p>
    </>
  );
}
