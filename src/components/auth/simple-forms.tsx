"use client";

import { useActionState } from "react";
import { Lock, Mail } from "lucide-react";
import {
  requestPasswordReset,
  resendVerification,
  updatePassword,
  type AuthState,
} from "@/app/(auth)/actions";
import { PasswordField, TextField } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "./submit-button";

export function ForgotPasswordForm() {
  const [state, action] = useActionState<AuthState, FormData>(requestPasswordReset, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage>{state.error}</FormMessage>
      <FormMessage tone="success">{state.success}</FormMessage>
      <TextField
        label="Email address"
        hideLabel
        name="email"
        type="email"
        autoComplete="email"
        placeholder="Email address"
        icon={<Mail className="size-[18px]" />}
        defaultValue={state.values?.email}
        error={state.fields?.email}
        required
      />
      <div className="pt-3">
        <SubmitButton>Send reset link</SubmitButton>
      </div>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState<AuthState, FormData>(updatePassword, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage>{state.error}</FormMessage>
      <PasswordField
        label="New password"
        name="password"
        autoComplete="new-password"
        icon={<Lock className="size-[18px]" />}
        error={state.fields?.password}
        hint="At least 8 characters with a letter and a number."
        required
      />
      <PasswordField
        label="Confirm new password"
        name="confirm"
        autoComplete="new-password"
        icon={<Lock className="size-[18px]" />}
        error={state.fields?.confirm}
        required
      />
      <div className="pt-3">
        <SubmitButton>Update password</SubmitButton>
      </div>
    </form>
  );
}

export function ResendVerificationForm({ email }: { email?: string }) {
  const [state, action] = useActionState<AuthState, FormData>(resendVerification, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage>{state.error}</FormMessage>
      <FormMessage tone="success">{state.success}</FormMessage>
      <TextField
        label="Email address"
        hideLabel
        name="email"
        type="email"
        placeholder="Email address"
        icon={<Mail className="size-[18px]" />}
        defaultValue={email}
        error={state.fields?.email}
        required
      />
      <SubmitButton arrow={false}>Resend verification email</SubmitButton>
    </form>
  );
}
