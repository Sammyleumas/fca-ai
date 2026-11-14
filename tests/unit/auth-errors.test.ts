import { afterEach, describe, expect, it, vi } from "vitest";
import { authErrorReference, describeAuthError } from "@/lib/auth/errors";

vi.mock("server-only", () => ({}));

describe("auth error messages (show the real cause instead of one catch-all)", () => {
  it("explains Supabase configuration problems with a reference", () => {
    expect(describeAuthError({ status: 400, code: "captcha_failed", message: "captcha protection: request disallowed" }, "guest")).toMatch(/CAPTCHA.*Attack Protection.*ref: captcha_failed/);
    expect(describeAuthError({ status: 401, message: "Invalid API key" }, "guest")).toMatch(/invalid project key.*ref: http_401/);
    expect(describeAuthError({ status: 500, code: "unexpected_failure", message: "Database error saving new user" }, "guest")).toMatch(/database isn't set up/);
    expect(describeAuthError({ status: 422, code: "anonymous_provider_disabled", message: "Anonymous sign-ins are disabled" }, "guest")).toMatch(/Guest access is switched off/);
    expect(describeAuthError({ status: 422, code: "signup_disabled", message: "Signups not allowed for this instance" }, "signup")).toMatch(/sign-ups are switched off/);
    expect(describeAuthError({ status: 0, name: "AuthRetryableFetchError", message: "fetch failed" }, "login")).toMatch(/couldn't reach the sign-in service/);
  });

  it("keeps ordinary outcomes plain", () => {
    expect(describeAuthError({ status: 400, code: "invalid_credentials", message: "Invalid login credentials" }, "login")).toBe("Incorrect email or password.");
    expect(describeAuthError({ status: 422, code: "weak_password", message: "weak" }, "signup")).toMatch(/too easy to guess/);
    expect(describeAuthError({ status: 422, code: "user_already_exists", message: "User already registered" }, "signup")).toMatch(/already exists/);
    expect(describeAuthError({ status: 429, code: "over_request_rate_limit", message: "rate" }, "guest")).toMatch(/Too many guest sessions/);
  });

  it("falls back to a specific message with the error reference", () => {
    expect(describeAuthError({ status: 418, code: "something_new", message: "?" }, "guest")).toBe("We couldn't start a guest session. Please try again. (ref: something_new)");
    expect(authErrorReference({ status: 503 })).toBe("http_503");
  });
});

describe("Supabase health diagnostics", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports reachability, guest sign-ins, email confirmation and whether setup.sql was run", async () => {
    const { authDiagnostics, schemaDiagnostics } = await import("@/lib/supabase/diagnostics");
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("/auth/v1/settings")
        ? new Response(JSON.stringify({ external: { anonymous_users: false, email: true }, disable_signup: false, mailer_autoconfirm: false }), { status: 200 })
        : new Response(JSON.stringify({ code: "PGRST205", message: "Could not find the table 'public.achievements'" }), { status: 404 }),
    );
    expect(await authDiagnostics()).toEqual({ reachable: true, status: 200, guestSignIns: false, emailSignIns: true, signupsEnabled: true, emailConfirmationRequired: true });
    expect(await schemaDiagnostics()).toBe("not_set_up");

    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ code: "42501", message: "permission denied" }), { status: 401 }));
    expect(await schemaDiagnostics()).toBe("ok");
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ message: "Invalid API key" }), { status: 401 }));
    expect(await schemaDiagnostics()).toBe("invalid_key");
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    expect((await authDiagnostics())?.reachable).toBe(false);
    expect(await schemaDiagnostics()).toBe("unreachable");
  });
});
