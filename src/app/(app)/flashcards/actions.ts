"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { schedule } from "@/lib/flashcards/srs";
import { createClient } from "@/lib/supabase/server";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const uuid = z.uuid();

/** Rates a card; the next review date is computed on the server. */
export async function reviewCard(cardId: string, rating: "difficult" | "practice" | "know"): Promise<Result<{ dueAt: string; intervalDays: number }>> {
  await requireUser();
  const p = z.object({ cardId: uuid, rating: z.enum(["difficult", "practice", "know"]) }).safeParse({ cardId, rating });
  if (!p.success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { data: card } = await supabase.from("flashcards").select("ease_factor, interval_days, repetitions, material_id").eq("id", cardId).maybeSingle();
  if (!card) return { ok: false, error: "Card not found." };
  const next = schedule({ ease: Number(card.ease_factor), intervalDays: card.interval_days, repetitions: card.repetitions }, p.data.rating);
  const { error } = await supabase.rpc("review_flashcard", {
    p_flashcard_id: cardId,
    p_rating: p.data.rating,
    p_ease: next.ease,
    p_interval_days: next.intervalDays,
    p_repetitions: next.repetitions,
    p_due_at: next.dueAt.toISOString(),
  });
  if (error) return { ok: false, error: "Could not save your answer." };
  await supabase.rpc("record_study_activity", { p_kind: "flashcard_review", p_minutes: 0, p_material_id: card.material_id });
  return { ok: true, dueAt: next.dueAt.toISOString(), intervalDays: next.intervalDays };
}

const cardSchema = z.object({
  id: uuid.optional(),
  materialId: uuid.nullable().optional(),
  front: z.string().trim().min(1, "Write the question or term.").max(2000),
  back: z.string().trim().min(1, "Write the answer.").max(4000),
  explanation: z.string().trim().max(4000).optional(),
});

export async function saveCard(input: z.input<typeof cardSchema>): Promise<Result> {
  const user = await requireUser();
  const p = cardSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid card." };
  const supabase = await createClient();
  const fields = { front: p.data.front, back: p.data.back, explanation: p.data.explanation || null };
  const { error } = p.data.id
    ? await supabase.from("flashcards").update(fields).eq("id", p.data.id)
    : await supabase.from("flashcards").insert({ ...fields, user_id: user.id, material_id: p.data.materialId ?? null, origin: "manual" });
  if (error) return { ok: false, error: "Could not save the card." };
  revalidatePath("/flashcards");
  return { ok: true };
}

export async function setCardSuspended(cardId: string, suspended: boolean): Promise<Result> {
  await requireUser();
  if (!uuid.safeParse(cardId).success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { error } = await supabase.from("flashcards").update({ suspended }).eq("id", cardId);
  if (error) return { ok: false, error: "Could not update the card." };
  revalidatePath("/flashcards");
  return { ok: true };
}

export async function deleteCard(cardId: string): Promise<Result> {
  await requireUser();
  if (!uuid.safeParse(cardId).success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { error } = await supabase.from("flashcards").delete().eq("id", cardId);
  if (error) return { ok: false, error: "Could not delete the card." };
  revalidatePath("/flashcards");
  return { ok: true };
}
