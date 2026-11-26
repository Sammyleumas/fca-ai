import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AIError, AI_ERROR_STATUS, isAIConfigured } from "@/lib/ai";
import { TRY_LIMITS, takeToken, visitorKey } from "./limits";

export const materialSchema = z.object({
  title: z.string().trim().max(200).default("My notes"),
  text: z.string().trim().min(40, "Add a bit more material first (at least a few sentences).").max(TRY_LIMITS.maxMaterialChars, "That material is too long. Try a shorter section."),
});

export function jsonError(message: string, status: number, extra?: Record<string, string>) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store", ...extra } });
}

/** Shared checks for every "Try it" AI request: AI configured, rate limit, valid JSON body. */
export async function guardTryAI<T extends z.ZodType>(request: Request, schema: T): Promise<{ ok: true; body: z.infer<T> } | { ok: false; response: Response }> {
  if (!isAIConfigured()) return { ok: false, response: jsonError("The AI isn't set up on this site yet. Please try again later.", 503) };
  const wait = takeToken(`ai:${visitorKey(request.headers)}`, TRY_LIMITS.aiPerHour);
  if (wait) {
    return {
      ok: false,
      response: jsonError(`You've used the free try-it limit for now. Please try again in about ${Math.ceil(wait / 60)} minutes, or create a free account.`, 429, { "Retry-After": String(wait) }),
    };
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: jsonError("Invalid request.", 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: jsonError(parsed.error.issues[0]?.message ?? "Invalid request.", 400) };
  return { ok: true, body: parsed.data };
}

export function aiErrorResponse(error: unknown, fallback: string) {
  if (error instanceof AIError) return jsonError(error.message, AI_ERROR_STATUS[error.code] ?? 503);
  return jsonError(fallback, 503);
}
