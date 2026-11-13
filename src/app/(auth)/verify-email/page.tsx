import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { AuthHeader } from "@/components/auth/auth-header";
import { ResendVerificationForm } from "@/components/auth/simple-forms";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : undefined;
  return (
    <>
      <div className="glass mb-8 flex size-14 items-center justify-center rounded-2xl text-accent">
        <MailCheck className="size-7" aria-hidden="true" />
      </div>
      <AuthHeader
        back="/login"
        title="Check your inbox"
        subtitle={
          email
            ? `We sent a verification link to ${email}. Open it on this device to activate your account.`
            : "We sent you a verification link. Open it on this device to activate your account."
        }
      />
      <ResendVerificationForm email={email} />
      <p className="mt-8 text-center text-sm text-fg-2">
        Already verified?{" "}
        <Link href="/login" className="focus-ring rounded font-semibold text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
