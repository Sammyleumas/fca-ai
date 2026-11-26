import { NextResponse } from "next/server";
import { z } from "zod";
import { getAIProvider } from "@/lib/ai";
import { tryFlashcardPrompts, tryFlashcardsSchema } from "@/lib/try/prompts";
import { aiErrorResponse, guardTryAI, jsonError, materialSchema } from "@/lib/try/request";

export const maxDuration = 120;

const bodySchema = z.object({ material: materialSchema, count: z.number().int().min(3).max(20).default(10) });

/** "Try it" flashcards from the student's material (no account). */
export async function POST(request: Request) {
  const guard = await guardTryAI(request, bodySchema);
  if (!guard.ok) return guard.response;
  const { material, count } = guard.body;
  try {
    const { system, user } = tryFlashcardPrompts(material.title, material.text, count);
    const { object } = await getAIProvider().generateObject({ system, messages: [{ role: "user", content: user }], schema: tryFlashcardsSchema, maxTokens: 5000, effort: "low", signal: request.signal });
    const cards = object.cards.filter((c) => c.front.trim() && c.back.trim()).slice(0, count);
    if (!cards.length) return jsonError("We couldn't make flashcards from this material. Try adding more text.", 422);
    return NextResponse.json({ cards }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return aiErrorResponse(error, "The flashcard generator is unavailable right now.");
  }
}
