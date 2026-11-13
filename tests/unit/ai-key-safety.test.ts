import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Static checks that the Gemini key can only ever be read on the server. */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|mjs|js)$/.test(p) ? [p] : [];
  });
}
const src = files("src").map((p) => ({ path: p, code: readFileSync(p, "utf8") }));
const isClient = (code: string) => /^\s*["']use client["']/.test(code);

describe("Gemini API key protection", () => {
  it("is never referenced by client components", () => {
    const offenders = src
      .filter((f) => isClient(f.code))
      .filter((f) => /GEMINI_API_KEY|@google\/genai|@\/lib\/ai["'/]|@\/lib\/server-env/.test(f.code))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("is read in exactly one server-only module and never via a NEXT_PUBLIC_ variable", () => {
    const readers = src.filter((f) => f.code.includes("process.env.GEMINI_API_KEY")).map((f) => f.path);
    expect(readers).toEqual([join("src", "lib", "server-env.ts")]);
    expect(src.some((f) => /NEXT_PUBLIC_[A-Z_]*GEMINI|NEXT_PUBLIC_[A-Z_]*GOOGLE_?AI/.test(f.code))).toBe(false);
  });

  it("keeps every module that touches the key or the SDK behind server-only", () => {
    for (const p of ["src/lib/server-env.ts", "src/lib/ai/index.ts", "src/lib/ai/providers/gemini.ts"]) {
      expect(readFileSync(p, "utf8")).toMatch(/^import "server-only";/m);
    }
    const sdkUsers = src.filter((f) => f.code.includes('from "@google/genai"')).map((f) => f.path);
    expect(sdkUsers).toEqual([join("src", "lib", "ai", "providers", "gemini.ts")]);
  });

  it("exposes only a boolean in the health check and ships a placeholder (no real key) in .env.example", () => {
    expect(readFileSync("src/app/api/health/route.ts", "utf8")).toMatch(/ai: isAIConfigured\(\)/);
    const example = readFileSync(".env.example", "utf8");
    expect(example).toMatch(/^GEMINI_API_KEY=$/m);
    expect(example).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
  });

  it("leaves no Anthropic dependency or call behind", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies)).not.toContain("@anthropic-ai/sdk");
    expect(pkg.dependencies["@google/genai"]).toBeTruthy();
    expect(src.filter((f) => /anthropic/i.test(f.code)).map((f) => f.path)).toEqual([]);
  });
});
