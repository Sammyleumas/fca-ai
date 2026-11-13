import "server-only";
import type { ListCard } from "@/components/flashcards/manage";
import { createClient } from "@/lib/supabase/server";

export type Deck = { id: string | null; title: string; total: number; due: number };

export async function getFlashcardOverview(userId: string) {
  const supabase = await createClient();
  const [cardsRes, matsRes] = await Promise.all([
    supabase
      .from("flashcards")
      .select("id, front, back, explanation, suspended, due_at, interval_days, origin, material_id, materials(title)")
      .eq("user_id", userId)
      .order("due_at")
      .limit(1000),
    supabase.from("materials").select("id, title").eq("user_id", userId).eq("status", "ready").order("title"),
  ]);
  const now = Date.now();
  const cards = (cardsRes.data ?? []).map((c) => {
    const m = Array.isArray(c.materials) ? c.materials[0] : c.materials;
    return { ...c, materialTitle: (m as { title: string } | null)?.title ?? null } as ListCard & { material_id: string | null };
  });
  const active = cards.filter((c) => !c.suspended);
  const isDue = (c: ListCard) => new Date(c.due_at).getTime() <= now;
  const due = active.filter(isDue);
  const decks = new Map<string, Deck>();
  for (const c of active) {
    const key = c.material_id ?? "none";
    const d = decks.get(key) ?? { id: c.material_id, title: c.materialTitle ?? "Your own cards", total: 0, due: 0 };
    d.total++;
    if (isDue(c)) d.due++;
    decks.set(key, d);
  }
  return {
    cards,
    active,
    due,
    learned: active.filter((c) => c.interval_days >= 21).length,
    decks,
    materials: (matsRes.data ?? []) as { id: string; title: string }[],
  };
}
