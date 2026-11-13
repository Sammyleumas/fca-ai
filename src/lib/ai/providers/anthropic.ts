import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { AIError, type AIProvider, type AITextStream, type AIUsage, type GenerateOptions } from "../types";

// Server-side refusal fallback: if the primary model declines on policy grounds the
// API re-runs the request on a fallback model it picks for that category.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

function mapError(error: unknown): AIError {
  if (error instanceof AIError) return error;
  if (error instanceof Anthropic.RateLimitError) return new AIError("rate_limited", "The AI service is busy. Please try again shortly.");
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AIError("not_configured", "The AI service is not configured correctly.");
  }
  if (error instanceof Anthropic.APIError) return new AIError("unavailable", "The AI service is temporarily unavailable.");
  return new AIError("unavailable", "The AI service is temporarily unavailable.");
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  streamText({ system, messages, maxTokens = 4000, effort = "medium", signal }: GenerateOptions): AITextStream {
    const stream = this.client.beta.messages.stream(
      {
        model: this.model,
        max_tokens: maxTokens,
        system,
        messages,
        output_config: { effort },
        betas: [FALLBACK_BETA],
        fallbacks: "default",
      },
      { signal },
    );

    let text = "";
    const model = this.model;
    async function* deltas() {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            text += event.delta.text;
            yield event.delta.text;
          }
        }
      } catch (error) {
        throw mapError(error);
      }
    }

    return {
      textStream: deltas(),
      async final() {
        try {
          const message = await stream.finalMessage();
          const usage: AIUsage = {
            model: message.model ?? model,
            inputTokens: message.usage.input_tokens ?? 0,
            outputTokens: message.usage.output_tokens ?? 0,
          };
          return { text, usage, stopReason: message.stop_reason ?? null };
        } catch (error) {
          throw mapError(error);
        }
      },
    };
  }

  async generateObject<T>({
    system,
    messages,
    schema,
    maxTokens = 16000,
    effort = "medium",
    signal,
  }: GenerateOptions & { schema: z.ZodType<T> }): Promise<{ object: T; usage: AIUsage }> {
    try {
      const response = await this.client.beta.messages.parse(
        {
          model: this.model,
          max_tokens: maxTokens,
          system,
          messages,
          output_config: { effort, format: betaZodOutputFormat(schema) },
          betas: [FALLBACK_BETA],
          fallbacks: "default",
        },
        { signal },
      );
      if (response.stop_reason === "refusal") throw new AIError("refused", "The AI declined this request.");
      const parsed = response.parsed_output;
      if (parsed == null) throw new AIError("invalid_output", "The AI returned an unexpected format.");
      return {
        object: parsed as T,
        usage: {
          model: response.model ?? this.model,
          inputTokens: response.usage.input_tokens ?? 0,
          outputTokens: response.usage.output_tokens ?? 0,
        },
      };
    } catch (error) {
      throw mapError(error);
    }
  }
}
