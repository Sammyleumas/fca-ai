import { z } from "zod";

/**
 * Environment access. Public values are inlined by Next.js at build time, so they
 * are referenced explicitly (dynamic `process.env[key]` access would not be inlined).
 *
 * Values pasted into a hosting dashboard often carry small mistakes (spaces, quotes,
 * a missing "https://", a trailing slash or "/rest/v1"), so they are normalised
 * before use rather than crashing the app.
 */
/**
 * FCA-AI's own Supabase project. Both values are public by design (the publishable
 * key only works under Row Level Security), so they ship as defaults and the app
 * works even before any hosting environment variables are set. Environment
 * variables still take precedence (e.g. for a staging project).
 */
export const DEFAULT_SUPABASE_URL = "https://hpsoenqovicutnztjyqd.supabase.co";
export const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_cPCOmTtx8SuZr5sPVE0R6w_-la7eHqJ";

function clean(v: string | undefined): string | undefined {
  const s = v?.trim().replace(/^["']|["']$/g, "").trim();
  return s ? s : undefined;
}

export function normaliseSupabaseUrl(raw: string | undefined): string | undefined {
  let s = clean(raw);
  if (!s) return undefined;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  s = s.replace(/\/+(rest|auth)\/v1\/?.*$/i, "").replace(/\/+$/, "");
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch {
    return undefined;
  }
}

/** The configured Supabase URL and publishable key, or null when missing/invalid. */
export function supabasePublicConfig(): { url: string; key: string } | null {
  const url = normaliseSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? DEFAULT_SUPABASE_URL;
  const key =
    clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ??
    DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || key.length < 20) return null;
  return { url, key };
}

const siteSchema = z.url();

export function publicEnv() {
  const config = supabasePublicConfig();
  if (!config) {
    throw new Error(
      "FCA-AI is missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).",
    );
  }
  const site = clean(process.env.NEXT_PUBLIC_SITE_URL);
  return {
    NEXT_PUBLIC_SUPABASE_URL: config.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.key,
    // An invalid site URL is ignored (the request's own origin is used instead).
    NEXT_PUBLIC_SITE_URL: site && siteSchema.safeParse(site).success ? site : undefined,
  };
}

export function isSupabaseConfigured(): boolean {
  return supabasePublicConfig() !== null;
}
