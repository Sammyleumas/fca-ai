import { NextResponse } from "next/server";
import { z } from "zod";
import { getAIProvider } from "@/lib/ai";
import { cleanQuiz, tryQuizPrompts, tryQuizSchema } from "@/lib/try/prompts";
import { aiErrorResponse, guardTryAI, jsonError, materialSchema } from "@/lib/try/request";

export const maxDuration = 120;

const bodySchema = z.object({ material: materialSchema, count: z.number().int().min(3).max(15).default(8) });

/** "Try it" practice quiz from the student's material (no account; marked in the browser). */
export async function POST(request: Request) {
  const guard = await guardTryAI(request, bodySchema);
  if (!guard.ok) return guard.response;
  const { material, count } = guard.body;
  try {
    const { system, user } = tryQuizPrompts(material.title, material.text, count);
    const { object } = await getAIProvider().generateObject({ system, messages: [{ role: "user", content: user }], schema: tryQuizSchema, maxTokens: 6000, effort: "low", signal: request.signal });
    const questions = cleanQuiz(object, count);
    if (questions.length < 2) return jsonError("We couldn't make reliable questions from this material. Try adding more text.", 422);
    return NextResponse.json({ questions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return aiErrorResponse(error, "The quiz generator is unavailable right now.");
  }
}
