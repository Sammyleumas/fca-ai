"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Lock, Mail, User } from "lucide-react";
import { signup, type AuthState } from "@/app/(auth)/actions";
import { PasswordField, TextField } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "./submit-button";

export function SignupForm() {
  const [state, action] = useActionState<AuthState, FormData>(signup, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage>{state.error}</FormMessage>
      <TextField
        label="What should we call you?"
        hideLabel
        name="name"
        autoComplete="given-name"
        placeholder="Preferred name"
        icon={<User className="size-[18px]" />}
        defaultValue={state.values?.name}
        error={state.fields?.name}
        required
      />
      <TextField
        label="Email address"
        hideLabel
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="Email address"
        icon={<Mail className="size-[18px]" />}
        defaultValue={state.values?.email}
        error={state.fields?.email}
        required
      />
      <PasswordField
        label="Password"
        hideLabel
        name="password"
        autoComplete="new-password"
        placeholder="Create a password"
        icon={<Lock className="size-[18px]" />}
        error={state.fields?.password}
        hint="At least 8 characters with a letter and a number."
        required
      />
      <label className="flex items-start gap-3 pt-1 text-sm text-fg-2">
        <input
          type="checkbox"
          name="terms"
          className="mt-0.5 size-4 shrink-0 rounded accent-[#D6FF35]"
          aria-invalid={state.fields?.terms ? true : undefined}
        />
        <span>
          I agree to the{" "}
          <Link href="/legal/terms" className="text-fg underline underline-offset-4">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="text-fg underline underline-offset-4">
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      {state.fields?.terms && <p className="text-sm text-error">{state.fields.terms}</p>}
      <div className="pt-3">
        <SubmitButton>Create Account</SubmitButton>
      </div>
    </form>
  );
}
