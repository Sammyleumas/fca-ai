"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Lock, Mail } from "lucide-react";
import { login, type AuthState } from "@/app/(auth)/actions";
import { PasswordField, TextField } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/feedback";
import { SubmitButton } from "./submit-button";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<AuthState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage>{state.error}</FormMessage>
      <input type="hidden" name="next" value={next ?? ""} />
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
        autoComplete="current-password"
        placeholder="Password"
        icon={<Lock className="size-[18px]" />}
        error={state.fields?.password}
        required
      />
      <div className="flex justify-end pt-1 text-sm">
        <Link href="/forgot-password" className="focus-ring rounded font-medium text-fg underline-offset-4 hover:underline">
          Forgot password?
        </Link>
      </div>
      <div className="pt-3">
        <SubmitButton>Sign In</SubmitButton>
      </div>
    </form>
  );
}
