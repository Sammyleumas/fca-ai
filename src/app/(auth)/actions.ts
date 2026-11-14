"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { describeAuthError, logAuthError } from "@/lib/auth/errors";
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

/** Shown instead of crashing when this deployment has no (valid) Supabase settings. */
const NOT_CONFIGURED: AuthState = {
  error: "Accounts aren't available on this site yet: it isn't connected to its database. Please try again later.",
};

function values(formData: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values: values(formData, ["email"]) };

  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    if (error.code === "email_not_confirmed") {
      redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
    }
    logAuthError(error, "login");
    return { error: describeAuthError(error, "login"), values: values(formData, ["email"]) };
  }
  redirect(safeNextPath(parsed.data.next));
}

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values: values(formData, ["name", "email"]) };

  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = await createClient();
  // A guest signing up would get a separate, empty account and lose their guest work:
  // send them to "Save your account", which keeps everything.
  const { data: current } = await supabase.auth.getClaims();
  if (current?.claims?.is_anonymous === true) redirect("/account/save");
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${await siteUrl()}/auth/confirm?next=/onboarding`,
      data: { preferred_name: parsed.data.name },
    },
  });
  if (error) {
    logAuthError(error, "signup");
    return { error: describeAuthError(error, "signup"), values: values(formData, ["name", "email"]) };
  }
  // Email confirmation enabled -> no session yet.
  if (!data.session) redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
  redirect("/onboarding");
}

export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values: values(formData, ["email"]) };
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteUrl()}/auth/confirm?next=/reset-password`,
  });
  if (error) {
    logAuthError(error, "reset");
    // Only service/configuration problems are shown; nothing reveals whether the account exists.
    if (error.status === 429 || error.status === 0 || (error.status ?? 500) >= 500 || /captcha|api key/i.test(error.message)) {
      return { error: describeAuthError(error, "reset"), values: values(formData, ["email"]) };
    }
  }
  // Same response whether or not the account exists (no account enumeration).
  return { success: "If an account exists for that email, we've sent a link to reset your password." };
}

export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
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
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: `${await siteUrl()}/auth/confirm?next=/onboarding` },
  });
  if (error) {
    logAuthError(error, "resend");
    return { error: describeAuthError(error, "resend") };
  }
  return { success: "Verification email sent. Check your inbox (and spam folder)." };
}

const OAUTH_PROVIDERS = { google: "google", apple: "apple", microsoft: "azure" } as const;

export async function signInWithProvider(formData: FormData) {
  const key = String(formData.get("provider")) as keyof typeof OAUTH_PROVIDERS;
  const provider = OAUTH_PROVIDERS[key];
  if (!provider) redirect("/login?error=provider");
  const next = safeNextPath(String(formData.get("next") ?? ""));
  if (!isSupabaseConfigured()) redirect("/login?error=oauth_unavailable");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      scopes: provider === "azure" ? "email" : undefined,
    },
  });
  if (error) logAuthError(error, "oauth");
  if (error || !data.url) redirect(`/login?error=oauth_unavailable`);
  redirect(data.url);
}

/**
 * "Continue as guest": a real but anonymous Supabase account (is_anonymous claim).
 * Everything stays private to this browser session under RLS; the guest can later
 * save the account with an email and password and keep all their work.
 */
export async function continueAsGuest(_prev: AuthState, formData: FormData): Promise<AuthState> {
  void formData;
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = await createClient();
  // Already in a session (guest or not)? Reuse it rather than creating another guest.
  const { data: current } = await supabase.auth.getClaims();
  if (current?.claims?.sub) redirect("/dashboard");
  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    logAuthError(error, "guest");
    return { error: describeAuthError(error, "guest") };
  }
  redirect("/onboarding");
}

/** Step 1 of saving a guest account: attach an email (verified by link), then choose a password. */
export async function saveGuestAccount(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values: values(formData, ["email"]) };
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  if (data.claims.is_anonymous !== true) redirect("/settings");
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data.email },
    { emailRedirectTo: `${await siteUrl()}/auth/confirm?next=${encodeURIComponent("/reset-password?saved=1")}` },
  );
  if (error) {
    logAuthError(error, "save_guest");
    return {
      error:
        error.code === "email_exists" || /already/i.test(error.message)
          ? "That email already has an FCA-AI account. Sign in to it instead (your guest work stays in this guest session)."
          : describeAuthError(error, "save_guest"),
      values: values(formData, ["email"]),
    };
  }
  return { success: `Check ${parsed.data.email} — open the link we sent to confirm it, then choose a password. Open the link in this same browser.` };
}
