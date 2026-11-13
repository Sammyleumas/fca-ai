import { describe, expect, it } from "vitest";
import { normaliseSupabaseUrl } from "@/lib/env";

describe("Supabase URL normalisation (values pasted into hosting dashboards)", () => {
  it("accepts common mistakes", () => {
    const want = "https://abc.supabase.co";
    for (const v of ["https://abc.supabase.co", "abc.supabase.co", " https://abc.supabase.co/ ", '"https://abc.supabase.co"', "https://abc.supabase.co/rest/v1/", "https://abc.supabase.co/auth/v1"]) {
      expect(normaliseSupabaseUrl(v)).toBe(want);
    }
  });
  it("rejects empty or unusable values", () => {
    expect(normaliseSupabaseUrl(undefined)).toBeUndefined();
    expect(normaliseSupabaseUrl("   ")).toBeUndefined();
    expect(normaliseSupabaseUrl("https://")).toBeUndefined();
  });
});

describe("built-in Supabase project", () => {
  it("is used when no environment variables are set, and env vars override it", async () => {
    const { supabasePublicConfig, DEFAULT_SUPABASE_URL } = await import("@/lib/env");
    const saved = { ...process.env };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(supabasePublicConfig()?.url).toBe(DEFAULT_SUPABASE_URL);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "other.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_xxxxxxxxxxxxxxxxxxxx";
    expect(supabasePublicConfig()).toEqual({ url: "https://other.supabase.co", key: "sb_publishable_xxxxxxxxxxxxxxxxxxxx" });
    process.env = saved;
  });
});
