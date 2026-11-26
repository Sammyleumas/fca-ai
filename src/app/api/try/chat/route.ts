import { z } from "zod";
import { AIError, getAIProvider, type ChatMessage } from "@/lib/ai";
import { TRY_LIMITS } from "@/lib/try/limits";
import { tryTutorSystemPrompt } from "@/lib/try/prompts";
import { aiErrorResponse, guardTryAI, jsonError, materialSchema } from "@/lib/try/request";

export const maxDuration = 120;

const bodySchema = z.object({
  material: materialSchema,
  /** The conversation so far (kept in the student's browser), ending with their new question. */
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(8_000) }))
    .min(1)
    .max(TRY_LIMITS.maxHistoryMessages + 1),
});

/**
 * "Try it" tutor chat — no account, no database. Streams plain text with the same
 * "[[error:…]]" convention as the main tutor so the UI can show failures.
 */
export async function POST(request: Request) {
  const guard = await guardTryAI(request, bodySchema);
  if (!guard.ok) return guard.response;
  const { material, messages } = guard.body;
  const last = messages[messages.length - 1];
  if (last.role !== "user") return jsonError("Ask a question first.", 400);
  if (last.content.length > TRY_LIMITS.maxMessageChars) {
    return Response.json({ error: `Keep questions under ${TRY_LIMITS.maxMessageChars.toLocaleString("en")} characters.` }, { status: 400 });
  }
  const history: ChatMessage[] = messages.slice(-TRY_LIMITS.maxHistoryMessages - 1);
  while (history.length && history[0].role !== "user") history.shift();

  let provider;
  try {
    provider = getAIProvider();
  } catch (error) {
    return aiErrorResponse(error, "The AI tutor is unavailable right now.");
  }
  const stream = provider.streamText({ system: tryTutorSystemPrompt(material.title, material.text), messages: history, maxTokens: 3000, effort: "low", signal: request.signal });
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream.textStream) controller.enqueue(encoder.encode(chunk));
        const { text, stopReason } = await stream.final();
        if (stopReason === "refusal" && !text.trim()) {
          controller.enqueue(encoder.encode("I can't help with that request, but I'm happy to help you study something else."));
        }
      } catch (error) {
        const message = error instanceof AIError ? error.message : "The AI tutor stopped unexpectedly.";
        controller.enqueue(encoder.encode(`\n\n[[error:${message}]]`));
      }
      controller.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
