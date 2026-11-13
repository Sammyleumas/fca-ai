import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";

/**
 * Service-role client. Bypasses RLS — only use from trusted server code AFTER the
 * caller has been authorised (e.g. writing AI replies, webhooks, account deletion).
 */
export function createAdminClient() {
  const key = serverEnv.supabaseServiceRoleKey;
  if (!key) {
    throw new Error("SUPABASE_SECRET_KEY (service role) is not configured on the server.");
  }
  return createClient(publicEnv().NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function hasAdminClient(): boolean {
  return Boolean(serverEnv.supabaseServiceRoleKey);
}
