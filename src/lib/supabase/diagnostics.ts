import "server-only";
import { supabasePublicConfig } from "@/lib/env";

export type AuthDiagnostics = {
  reachable: boolean;
  status: number | null;
  /** Whether "Allow anonymous sign-ins" (guest mode) is on, when Supabase reports it. */
  guestSignIns: boolean | null;
  emailSignIns: boolean | null;
  signupsEnabled: boolean | null;
  /** true = new users must confirm their email first. */
  emailConfirmationRequired: boolean | null;
};

export type SchemaDiagnostics = "ok" | "not_set_up" | "invalid_key" | "error" | "unreachable";

const TIMEOUT = 5000;

export type ConfigSummary = {
  /** Supabase project ID from the URL (public: it is in every browser request). */
  project: string | null;
  urlSource: "NEXT_PUBLIC_SUPABASE_URL" | "built-in default";
  keySource: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" | "NEXT_PUBLIC_SUPABASE_ANON_KEY" | "built-in default";
  keyType: "publishable" | "legacy_anon" | "secret" | "service_role" | "unknown";
  /** For legacy JWT keys only: the project the key belongs to, and whether it matches the URL. */
  keyProject: string | null;
  keyMatchesProject: boolean | null;
};

function projectRef(url: string): string | null {
  const m = /^https:\/\/([a-z0-9]{20})\.supabase\.co$/i.exec(url);
  return m ? m[1].toLowerCase() : null;
}

function jwtPayload(key: string): { ref?: string; role?: string } | null {
  const part = key.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { ref?: string; role?: string };
  } catch {
    return null;
  }
}

/**
 * Which Supabase project the site talks to and where its settings come from — names
 * and public IDs only, never key values. Catches a URL from one project paired with a
 * key from another (e.g. a Vercel integration overriding hand-set variables).
 */
export function configSummary(): ConfigSummary | null {
  const config = supabasePublicConfig();
  if (!config) return null;
  const has = (k: string) => Boolean(process.env[k]?.trim().replace(/^["']|["']$/g, "").trim());
  const keySource = has("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
    ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    : has("NEXT_PUBLIC_SUPABASE_ANON_KEY")
      ? "NEXT_PUBLIC_SUPABASE_ANON_KEY"
      : "built-in default";
  const project = projectRef(config.url);
  let keyType: ConfigSummary["keyType"] = "unknown";
  let keyProject: string | null = null;
  if (config.key.startsWith("sb_publishable_")) keyType = "publishable";
  else if (config.key.startsWith("sb_secret_")) keyType = "secret";
  else {
    const payload = jwtPayload(config.key);
    if (payload) {
      keyType = payload.role === "service_role" ? "service_role" : payload.role === "anon" ? "legacy_anon" : "unknown";
      keyProject = typeof payload.ref === "string" ? payload.ref : null;
    }
  }
  return {
    project,
    urlSource: has("NEXT_PUBLIC_SUPABASE_URL") ? "NEXT_PUBLIC_SUPABASE_URL" : "built-in default",
    keySource,
    keyType,
    keyProject,
    keyMatchesProject: keyProject && project ? keyProject === project : null,
  };
}

/**
 * Public, read-only checks using only the publishable key (no secrets): can the app
 * reach Supabase Auth, which sign-in methods are on, and do the app's tables exist?
 */
export async function authDiagnostics(): Promise<AuthDiagnostics | null> {
  const config = supabasePublicConfig();
  if (!config) return null;
  try {
    const res = await fetch(`${config.url}/auth/v1/settings`, { headers: { apikey: config.key }, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
    if (!res.ok) return { reachable: true, status: res.status, guestSignIns: null, emailSignIns: null, signupsEnabled: null, emailConfirmationRequired: null };
    const s = (await res.json()) as { external?: Record<string, boolean>; disable_signup?: boolean; mailer_autoconfirm?: boolean };
    return {
      reachable: true,
      status: res.status,
      guestSignIns: typeof s.external?.anonymous_users === "boolean" ? s.external.anonymous_users : null,
      emailSignIns: typeof s.external?.email === "boolean" ? s.external.email : null,
      signupsEnabled: typeof s.disable_signup === "boolean" ? !s.disable_signup : null,
      emailConfirmationRequired: typeof s.mailer_autoconfirm === "boolean" ? !s.mailer_autoconfirm : null,
    };
  } catch {
    return { reachable: false, status: null, guestSignIns: null, emailSignIns: null, signupsEnabled: null, emailConfirmationRequired: null };
  }
}

/** Has supabase/setup.sql been run? A missing table gives 404; an existing one 200 or "permission denied". */
export async function schemaDiagnostics(): Promise<SchemaDiagnostics | null> {
  const config = supabasePublicConfig();
  if (!config) return null;
  try {
    const res = await fetch(`${config.url}/rest/v1/achievements?select=id&limit=1`, {
      headers: { apikey: config.key },
      signal: AbortSignal.timeout(TIMEOUT),
      cache: "no-store",
    });
    if (res.ok) return "ok";
    const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    if (res.status === 404 || body.code === "PGRST205" || body.code === "42P01") return "not_set_up";
    // The table exists but visitors may not read it (Row Level Security): that's fine.
    if (body.code === "42501") return "ok";
    if (/api key/i.test(body.message ?? "") || res.status === 401) return "invalid_key";
    return "error";
  } catch {
    return "unreachable";
  }
}
