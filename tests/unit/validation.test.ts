import { describe, expect, it } from "vitest";
import { loginSchema, resetSchema, signupSchema } from "@/lib/validation/auth";
import { onboardingSchema } from "@/lib/validation/profile";

describe("auth validation", () => {
  it("normalises email and validates password strength", () => {
    const ok = signupSchema.safeParse({ name: "Alex", email: "  Alex@Example.COM ", password: "studyhard1", terms: "on" });
    expect(ok.success && ok.data.email).toBe("alex@example.com");
    expect(signupSchema.safeParse({ name: "A", email: "a@b.co", password: "short", terms: "on" }).success).toBe(false);
    expect(signupSchema.safeParse({ name: "A", email: "a@b.co", password: "lettersonly", terms: "on" }).success).toBe(false);
    expect(signupSchema.safeParse({ name: "A", email: "a@b.co", password: "studyhard1" }).success).toBe(false);
  });
  it("requires matching passwords on reset", () => {
    expect(resetSchema.safeParse({ password: "studyhard1", confirm: "studyhard2" }).success).toBe(false);
    expect(resetSchema.safeParse({ password: "studyhard1", confirm: "studyhard1" }).success).toBe(true);
  });
  it("rejects invalid login email", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
  });
});

describe("onboarding validation", () => {
  it("accepts a minimal submission with only a name (everything else skippable)", () => {
    const r = onboardingSchema.safeParse({ preferred_name: "Alex", timezone: "Africa/Lagos" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.subjects).toEqual([]);
      expect(r.data.daily_study_minutes).toBe(60);
    }
  });
  it("dedupes and trims subjects and rejects bad zones", () => {
    const r = onboardingSchema.safeParse({
      preferred_name: "Alex",
      timezone: "Mars/Olympus",
      subjects: [" Physics ", "physics", "Maths"],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.subjects).toEqual(["Physics", "Maths"]);
      expect(r.data.timezone).toBe("UTC");
    }
  });
  it("bounds the daily study duration", () => {
    expect(onboardingSchema.safeParse({ preferred_name: "A", timezone: "UTC", daily_study_minutes: 5 }).success).toBe(false);
  });
});
