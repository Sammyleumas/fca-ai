import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeader } from "@/components/auth/auth-header";
import { ForgotPasswordForm } from "@/components/auth/simple-forms";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeader back="/login" title="Forgot password?" subtitle="Enter your email and we'll send you a secure reset link." />
      <ForgotPasswordForm />
      <p className="mt-8 text-center text-sm text-fg-2">
        Remembered it?{" "}
        <Link href="/login" className="focus-ring rounded font-semibold text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
