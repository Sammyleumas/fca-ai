import "server-only";
import { AIError, getAIProvider, isAIConfigured } from "@/lib/ai";
import { serverEnv } from "@/lib/server-env";

export type AISelfTest = {
  ok: boolean;
  /** The model that answered (may be a backup), or the main model if none did. */
  model: string;
  fallbackModels: string[];
  ms: number;
  error?: string;
  checkedAt: string;
};

const CACHE_MS = 60_000; // at most one real Gemini call per minute per server instance
let last: { at: number; result: AISelfTest } | null = null;

/**
 * Sends Gemini one tiny prompt and reports whether it answered. Returns only the model
 * name, timing and the same user-safe message (with its "ref:" code) a student would
 * see — never the key or raw provider output.
 */
export async function aiSelfTest(now = Date.now()): Promise<AISelfTest> {
  if (last && now - last.at < CACHE_MS) return last.result;
  const model = serverEnv.geminiModel;
  const fallbackModels = serverEnv.geminiFallbackModels;
  const started = Date.now();
  let result: AISelfTest;
  if (!isAIConfigured()) {
    result = { ok: false, model, fallbackModels, ms: 0, error: "GEMINI_API_KEY is not set.", checkedAt: new Date(now).toISOString() };
  } else {
    try {
      const stream = getAIProvider().streamText({
        system: "You are a connectivity check. Reply with the single word OK.",
        messages: [{ role: "user", content: "Say OK." }],
        maxTokens: 16,
        effort: "low",
      });
      const { text, usage } = await stream.final();
      result = { ok: text.trim().length > 0, model: usage.model || model, fallbackModels, ms: Date.now() - started, checkedAt: new Date(now).toISOString() };
    } catch (e) {
      const error = e instanceof AIError ? e.message : "The AI service is temporarily unavailable.";
      result = { ok: false, model, fallbackModels, ms: Date.now() - started, error, checkedAt: new Date(now).toISOString() };
    }
  }
  last = { at: now, result };
  return result;
}

export function resetAISelfTestForTests() {
  last = null;
}
