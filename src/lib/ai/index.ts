import "server-only";
import { serverEnv } from "@/lib/server-env";
import { GeminiProvider } from "./providers/gemini";
import { AIError, type AIProvider } from "./types";

let cached: AIProvider | null = null;

/**
 * Returns the configured provider (Google Gemini via the Gemini Developer API).
 * Feature code depends only on the AIProvider interface. The API key is read on
 * the server only and is never sent to the browser.
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;
  switch (serverEnv.aiProvider) {
    case "gemini": {
      const key = serverEnv.geminiApiKey;
      if (!key) throw new AIError("not_configured", "AI features are not configured yet.");
      cached = new GeminiProvider(key, serverEnv.geminiModel);
      return cached;
    }
    default:
      throw new AIError("not_configured", "AI features are not configured yet.");
  }
}

export function isAIConfigured(): boolean {
  return serverEnv.aiProvider === "gemini" && Boolean(serverEnv.geminiApiKey);
}

/** For tests: forget the cached provider after changing the environment. */
export function resetAIProviderForTests() {
  cached = null;
}

export { AIError, AI_ERROR_STATUS } from "./types";
export type { AIProvider, ChatMessage } from "./types";
