import "server-only";

/** Default model: Gemini 3.8 Flash (stable; available on the Gemini API free tier). */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

/**
 * Tried in order when the main model is overloaded (503), over its free-tier limit (429)
 * or not found (404). On the free tier each model has its own limits, so a backup model
 * often still answers. Override with GEMINI_FALLBACK_MODELS (comma-separated, or "none").
 */
export const DEFAULT_GEMINI_FALLBACK_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash"];

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
  /** Backup models for overload / quota / not-found errors (never includes the main model). */
  get geminiFallbackModels(): string[] {
    const raw = process.env.GEMINI_FALLBACK_MODELS?.trim();
    if (raw?.toLowerCase() === "none") return [];
    const list = raw ? raw.split(",").map((m) => m.trim()).filter(Boolean) : DEFAULT_GEMINI_FALLBACK_MODELS;
    return [...new Set(list)].filter((m) => m !== this.geminiModel);
  },
};
