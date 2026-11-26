import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * Accounts off (the default): everyone goes straight into the study app. No sign-in,
 * no Supabase calls; account pages redirect home; account APIs say they're off.
 */
vi.mock("server-only", () => ({}));

const { accountsEnabled, isOpenAccessPath } = await import("@/lib/features");
const { openAccess } = await import("@/lib/open-access");
const { proxy } = await import("@/proxy");

const req = (path: string) => new NextRequest(new URL(path, "https://fca-ai.example"));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("open access (no accounts)", () => {
  it("is the default; accounts only come back when explicitly turned on", () => {
    vi.stubEnv("NEXT_PUBLIC_ACCOUNTS_ENABLED", "");
    expect(accountsEnabled()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_ACCOUNTS_ENABLED", "true");
    expect(accountsEnabled()).toBe(true);
  });

  it("lets everyone into the study app, legal pages and its APIs", () => {
    for (const p of ["/", "/study", "/try", "/legal/terms", "/api/try/chat", "/api/try/extract", "/api/health"]) {
      expect(isOpenAccessPath(p), p).toBe(true);
      expect(openAccess(req(p)).headers.get("location"), p).toBeNull();
    }
  });

  it("sends account pages (sign-in, dashboard, planner…) to the study app at /study instead of failing", () => {
    for (const p of ["/login", "/signup", "/dashboard", "/planner/new", "/library/abc", "/auth/callback?code=x", "/onboarding"]) {
      const res = openAccess(req(p));
      expect(res.status, p).toBe(307);
      expect(res.headers.get("location"), p).toBe("https://fca-ai.example/study");
    }
  });

  it("answers account-only APIs with a clear message", async () => {
    const res = openAccess(req("/api/ai/chat"));
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "Accounts are turned off on this site." });
  });

  it("never contacts Supabase while accounts are off", async () => {
    vi.stubEnv("NEXT_PUBLIC_ACCOUNTS_ENABLED", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await proxy(req("/dashboard"));
    expect(res.headers.get("location")).toBe("https://fca-ai.example/study");
    const health = await (await import("@/app/api/health/route")).GET(new Request("https://fca-ai.example/api/health"));
    expect(await health.json()).toMatchObject({ status: "ok", accounts: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
