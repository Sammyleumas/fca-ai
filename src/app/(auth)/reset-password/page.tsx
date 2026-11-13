import type { Metadata } from "next";
import { AuthHeader } from "@/components/auth/auth-header";
import { ResetPasswordForm } from "@/components/auth/simple-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <>
      <AuthHeader back="/login" title="Choose a new password" subtitle="You'll stay signed in after updating it." />
      <ResetPasswordForm />
    </>
  );
}
