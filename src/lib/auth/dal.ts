import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { ProfileRow } from "@/types/db";

export type SessionUser = { id: string; email: string | null };

/**
 * Data Access Layer: verifies the session JWT (signature + expiry) via getClaims().
 * Memoised per request with React cache().
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Always touch request cookies first so every route that checks the session is
  // rendered per request, even in builds where Supabase isn't configured.
  await cookies();
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? null };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export const getProfile = cache(async (userId: string): Promise<ProfileRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw new Error("Could not load your profile.");
  return data as ProfileRow | null;
});

/** For app pages: signed in AND onboarded. */
export async function requireOnboardedUser(): Promise<{ user: SessionUser; profile: ProfileRow }> {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (!profile) redirect("/login?error=profile_missing");
  if (!profile.onboarding_completed_at) redirect("/onboarding");
  return { user, profile };
}

export function displayName(profile: Pick<ProfileRow, "preferred_name" | "full_name"> | null, email?: string | null) {
  return profile?.preferred_name || profile?.full_name?.split(" ")[0] || email?.split("@")[0] || "there";
}
