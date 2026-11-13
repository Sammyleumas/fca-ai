import type { z } from "zod";

export type ChatRole = "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };
export type Effort = "low" | "medium" | "high";

export type AIUsage = { model: string; inputTokens: number; outputTokens: number };

export type AIErrorCode =
  | "not_configured"
  | "rate_limited"
  | "quota_exceeded"
  | "unavailable"
  | "timeout"
  | "bad_request"
  | "refused"
  | "invalid_output";

/** HTTP status an API route should answer with for each AI error (shared by every AI route). */
export const AI_ERROR_STATUS: Record<AIErrorCode, number> = {
  not_configured: 503,
  rate_limited: 429,
  quota_exceeded: 429,
  unavailable: 503,
  timeout: 504,
  bad_request: 502,
  refused: 422,
  invalid_output: 502,
};

export class AIError extends Error {
  constructor(
    public readonly code: AIErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AIError";
  }
}

export interface AITextStream {
  /** Text deltas as they arrive. */
  textStream: AsyncIterable<string>;
  /**
   * Resolves after the stream ends. `stopReason` is "end_turn", "max_tokens" or
   * "refusal" (the provider declined / blocked the answer).
   */
  final(): Promise<{ text: string; usage: AIUsage; stopReason: string | null }>;
}

export interface GenerateOptions {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  effort?: Effort;
  signal?: AbortSignal;
}

/**
 * Provider abstraction. Feature code (tutor, segmentation, planner, quizzes…)
 * depends only on this interface so the LLM vendor can be swapped by config.
 */
export interface AIProvider {
  readonly name: string;
  streamText(options: GenerateOptions): AITextStream;
  generateObject<T>(options: GenerateOptions & { schema: z.ZodType<T> }): Promise<{ object: T; usage: AIUsage }>;
  /** Optional: transcribe the text of every page of a (small) PDF, in order. Used as OCR. */
  transcribePdf?(pdf: Uint8Array, pageCount: number, signal?: AbortSignal): Promise<{ pages: string[]; usage: AIUsage }>;
}
