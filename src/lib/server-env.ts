import "server-only";

/** Default model: Gemini 3.8 Flash (stable; available on the Gemini API free tier). */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

/** Server-only secrets. Never import this module from client components. */
export const serverEnv = {
  get supabaseServiceRoleKey(): string | undefined {
    return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  },
  get aiProvider(): string {
    const value = (process.env.AI_PROVIDER ?? "gemini").trim().toLowerCase();
    // Legacy deployments may still carry AI_PROVIDER=anthropic from before the Gemini migration.
    return value === "anthropic" || value === "" ? "gemini" : value;
  },
  /** Gemini Developer API key (Google AI Studio). Server only. */
  get geminiApiKey(): string | undefined {
    return process.env.GEMINI_API_KEY?.trim() || undefined;
  },
  /** Stable Gemini Flash model; override with GEMINI_MODEL. Verify with `npm run gemini:check`. */
  get geminiModel(): string {
    return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  },
};
