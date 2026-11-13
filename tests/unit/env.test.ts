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
