import "server-only";
import { AIError, getAIProvider, isAIConfigured } from "@/lib/ai";
import { GeminiProvider } from "@/lib/ai/providers/gemini";
import { serverEnv } from "@/lib/server-env";

export type ModelCheck = { model: string; ok: boolean; ms: number; error?: string; reason?: string };

export type AISelfTest = {
  /** True when at least one model answered (students will get answers). */
  ok: boolean;
  /** The first model, in the order the app tries them, that answered; else the main model. */
  model: string;
  fallbackModels: string[];
  ms: number;
  /** Student-facing message from the main model when nothing answered. */
  error?: string;
  /** Each model tested on its own, with Google's reason when it failed (keys redacted). */
  models?: ModelCheck[];
  checkedAt: string;
};

const CACHE_MS = 60_000; // at most one round of test calls per minute per server instance
const PER_MODEL_TIMEOUT_MS = 25_000;
let last: { at: number; result: AISelfTest } | null = null;

async function checkModel(provider: GeminiProvider, model: string): Promise<ModelCheck> {
  const started = Date.now();
  try {
    const stream = provider.onlyModel(model).streamText({
      system: "You are a connectivity check. Reply with the single word OK.",
      messages: [{ role: "user", content: "Say OK." }],
      maxTokens: 16,
      effort: "low",
      signal: AbortSignal.timeout(PER_MODEL_TIMEOUT_MS),
    });
    const { text } = await stream.final();
    return { model, ok: text.trim().length > 0, ms: Date.now() - started };
  } catch (e) {
    const error = e instanceof AIError ? e.message : "The AI service is temporarily unavailable.";
    const reason = e instanceof AIError ? e.detail : undefined;
    return { model, ok: false, ms: Date.now() - started, error, ...(reason && { reason }) };
  }
}

/**
 * Sends each Gemini model (main + backups) one tiny prompt, in parallel, and reports which
 * answer and Google's reason for any that don't. Never returns the API key.
 */
export async function aiSelfTest(now = Date.now()): Promise<AISelfTest> {
  if (last && now - last.at < CACHE_MS) return last.result;
  const model = serverEnv.geminiModel;
  const fallbackModels = serverEnv.geminiFallbackModels;
  const checkedAt = new Date(now).toISOString();
  const started = Date.now();
  let result: AISelfTest;
  if (!isAIConfigured()) {
    result = { ok: false, model, fallbackModels, ms: 0, error: "GEMINI_API_KEY is not set.", checkedAt };
  } else {
    try {
      const provider = getAIProvider();
      if (!(provider instanceof GeminiProvider)) throw new AIError("not_configured", "AI features are not configured yet.");
      const models = await Promise.all(provider.modelOrder.map((m) => checkModel(provider, m)));
      const working = models.find((m) => m.ok);
      result = {
        ok: Boolean(working),
        model: working?.model ?? model,
        fallbackModels,
        ms: Date.now() - started,
        ...(!working && { error: models[0]?.error }),
        models,
        checkedAt,
      };
    } catch (e) {
      const error = e instanceof AIError ? e.message : "The AI service is temporarily unavailable.";
      result = { ok: false, model, fallbackModels, ms: Date.now() - started, error, checkedAt };
    }
  }
  last = { at: now, result };
  return result;
}

export function resetAISelfTestForTests() {
  last = null;
}
