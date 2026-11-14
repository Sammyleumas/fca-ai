/**
 * Turns a Supabase Auth error into a specific, user-safe message — instead of one
 * catch-all — and logs the real cause (no emails or passwords) for the site owner.
 * Every message ends with a short reference so a screenshot shows the actual cause.
 */
export type AuthAction = "login" | "signup" | "guest" | "reset" | "resend" | "save_guest" | "oauth";

type SupabaseAuthErrorLike = { status?: number; code?: string; message?: string; name?: string };

export function authErrorReference(error: SupabaseAuthErrorLike): string {
  return error.code || (error.status ? `http_${error.status}` : error.name || "unknown");
}

export function describeAuthError(error: SupabaseAuthErrorLike, action: AuthAction): string {
  const msg = error.message ?? "";
  const ref = ` (ref: ${authErrorReference(error)})`;

  // Configuration problems on the Supabase side (the site owner must fix these).
  if (/captcha/i.test(msg) || error.code === "captcha_failed") {
    return `Sign-in protection (CAPTCHA) is switched on for this site, but the app doesn't support it yet. The site owner needs to turn it off in Supabase → Authentication → Attack Protection.${ref}`;
  }
  if (/invalid api key|no api key|apikey/i.test(msg) || (error.status === 401 && action !== "login")) {
    return `The app can't authenticate with its sign-in service (invalid project key).${ref}`;
  }
  if (/database error/i.test(msg) || error.code === "unexpected_failure") {
    return `The app's database isn't set up correctly yet, so the account couldn't be created.${ref}`;
  }
  if (error.code === "signup_disabled" || /signups? not allowed|signups are disabled/i.test(msg)) {
    return `New sign-ups are switched off for this site.${ref}`;
  }
  if (error.code === "email_provider_disabled" || /email (logins|signups) are disabled/i.test(msg)) {
    return `Email sign-in is switched off for this site.${ref}`;
  }
  if (error.code === "anonymous_provider_disabled" || /anonymous sign-?ins are disabled/i.test(msg)) {
    return `Guest access is switched off for this site. Please create a free account instead.${ref}`;
  }
  if (error.name === "AuthRetryableFetchError" || error.status === 0 || /fetch failed|network|ECONN|ENOTFOUND|timed? ?out/i.test(msg)) {
    return `We couldn't reach the sign-in service. Please try again in a moment.${ref}`;
  }
  if (error.code === "over_email_send_rate_limit") {
    return `Too many emails have been sent recently. Please wait a few minutes and try again.${ref}`;
  }
  if (error.status === 429 || error.code === "over_request_rate_limit") {
    return action === "guest"
      ? `Too many guest sessions from this network. Please try again later or create a free account.${ref}`
      : `Too many attempts. Please wait a minute and try again.${ref}`;
  }

  // Ordinary user-facing outcomes.
  if (action === "login" && (error.code === "invalid_credentials" || /invalid login credentials/i.test(msg))) return "Incorrect email or password.";
  if (error.code === "weak_password") return "That password is too easy to guess. Try a longer one.";
  if (error.code === "user_already_exists" || error.code === "email_exists") return "An account with this email already exists. Try signing in instead.";
  if (error.code === "email_address_invalid") return "That email address can't be used. Please check it and try again.";

  const fallback: Record<AuthAction, string> = {
    login: "We couldn't sign you in.",
    signup: "We couldn't create your account.",
    guest: "We couldn't start a guest session.",
    reset: "We couldn't send the reset email.",
    resend: "We couldn't send the email.",
    save_guest: "We couldn't send the confirmation email.",
    oauth: "We couldn't start sign-in with that provider.",
  };
  return `${fallback[action]} Please try again.${ref}`;
}

/** Server log line for the site owner (Vercel → Logs). Never includes emails or passwords. */
export function logAuthError(error: SupabaseAuthErrorLike, action: AuthAction) {
  console.error(
    JSON.stringify({ level: "error", msg: "auth failed", action, status: error.status ?? null, code: error.code ?? null, name: error.name ?? null, detail: (error.message ?? "").slice(0, 300) }),
  );
}
