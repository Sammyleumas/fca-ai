"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";
import { safeNextPath } from "@/lib/routes";
import {
  fieldErrors,
  forgotSchema,
  loginSchema,
  resetSchema,
  signupSchema,
  type FieldErrors,
} from "@/lib/validation/auth";

export type AuthState = { error?: string; fields?: FieldErrors; success?: string; values?: Record<string, string> };

function values(formData: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values: values(formData, ["email"]) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    if (error.code === "email_not_confirmed") {
      redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
    }
    return {
      error: error.status === 429 ? "Too many attempts. Please wait a minute and try again." : "Incorrect email or password.",
      values: values(formData, ["email"]),
    };
  }
  redirect(safeNextPath(parsed.data.next));
}

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values: values(formData, ["name", "email"]) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${await siteUrl()}/auth/confirm?next=/onboarding`,
      data: { preferred_name: parsed.data.name },
    },
  });
  if (error) {
    const msg =
      error.code === "weak_password"
        ? "That password is too easy to guess. Try a longer one."
        : error.status === 429
          ? "Too many sign-up attempts. Please try again shortly."
          : "We couldn't create your account. Please try again.";
    return { error: msg, values: values(formData, ["name", "email"]) };
  }
  // Email confirmation enabled -> no session yet.
  if (!data.session) redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
  redirect("/onboarding");
}

export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values: values(formData, ["email"]) };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteUrl()}/auth/confirm?next=/reset-password`,
  });
  // Same response whether or not the account exists (no account enumeration).
  return { success: "If an account exists for that email, we've sent a link to reset your password." };
}

export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Your reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      error:
        error.code === "same_password"
          ? "Choose a password different from your current one."
          : "We couldn't update your password. Please try again.",
    };
  }
  redirect("/dashboard?password=updated");
}

export async function resendVerification(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: `${await siteUrl()}/auth/confirm?next=/onboarding` },
  });
  if (error && error.status === 429) return { error: "Please wait a little before requesting another email." };
  return { success: "Verification email sent. Check your inbox (and spam folder)." };
}

const OAUTH_PROVIDERS = { google: "google", apple: "apple", microsoft: "azure" } as const;

export async function signInWithProvider(formData: FormData) {
  const key = String(formData.get("provider")) as keyof typeof OAUTH_PROVIDERS;
  const provider = OAUTH_PROVIDERS[key];
  if (!provider) redirect("/login?error=provider");
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      scopes: provider === "azure" ? "email" : undefined,
    },
  });
  if (error || !data.url) redirect(`/login?error=oauth_unavailable`);
  redirect(data.url);
}
