import "server-only";
import { serverEnv } from "@/lib/server-env";
import { AnthropicProvider } from "./providers/anthropic";
import { AIError, type AIProvider } from "./types";

let cached: AIProvider | null = null;

/** Returns the configured provider. Add new providers here; feature code is unaffected. */
export function getAIProvider(): AIProvider {
  if (cached) return cached;
  switch (serverEnv.aiProvider) {
    case "anthropic": {
      const key = serverEnv.anthropicApiKey;
      if (!key) throw new AIError("not_configured", "AI features are not configured yet (missing ANTHROPIC_API_KEY).");
      cached = new AnthropicProvider(key, serverEnv.anthropicModel);
      return cached;
    }
    default:
      throw new AIError("not_configured", `Unknown AI_PROVIDER "${serverEnv.aiProvider}".`);
  }
}

export function isAIConfigured(): boolean {
  return serverEnv.aiProvider === "anthropic" ? Boolean(serverEnv.anthropicApiKey) : false;
}

export { AIError } from "./types";
export type { AIProvider, ChatMessage } from "./types";
