import type { Metadata } from "next";
import { AuthHeader } from "@/components/auth/auth-header";
import { ResetPasswordForm } from "@/components/auth/simple-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const saved = (await searchParams).saved === "1";
  return (
    <>
      {saved ? (
        <AuthHeader title="Email confirmed — choose a password" subtitle="This finishes saving your guest work to your new account." />
      ) : (
        <AuthHeader back="/login" title="Choose a new password" subtitle="You'll stay signed in after updating it." />
      )}
      <ResetPasswordForm />
    </>
  );
}
