import type { Metadata } from "next";
import Link from "next/link";
import { Brain, Clock, Layers } from "lucide-react";
import { CardList, GenerateCards } from "@/components/flashcards/manage";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, FormMessage } from "@/components/ui/feedback";
import { CardHeader, GlassCard } from "@/components/ui/glass-card";
import { isAIConfigured } from "@/lib/ai";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { getFlashcardOverview } from "@/lib/data/flashcards";

export const metadata: Metadata = { title: "Flashcards" };
export const maxDuration = 120;

export default async function FlashcardsPage() {
  const { user } = await requireOnboardedUser();
  const { cards, active, due, learned, decks, materials } = await getFlashcardOverview(user.id);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Flashcards</h1>
          <p className="mt-1 text-sm text-fg-2">Spaced repetition: difficult cards return sooner, known ones later.</p>
        </div>
        {due.length > 0 && <ButtonLink href="/flashcards/review">Study {due.length} due card{due.length === 1 ? "" : "s"}</ButtonLink>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Clock, label: "Due now", value: due.length },
          { icon: Layers, label: "Active cards", value: active.length },
          { icon: Brain, label: "Well learned", value: learned },
        ].map(({ icon: Icon, label, value }) => (
          <GlassCard key={label} className="flex items-center gap-4 p-5">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-accent/15 text-accent"><Icon className="size-5" aria-hidden="true" /></span>
            <div>
              <p className="text-sm text-fg-2">{label}</p>
              <p className="text-2xl font-semibold">{value}</p>
            </div>
          </GlassCard>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-5">
          {decks.size > 0 && (
            <GlassCard className="p-5">
              <CardHeader title="Decks" />
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {[...decks.values()].map((d) => (
                  <li key={d.id ?? "none"}>
                    <Link href={`/flashcards/review${d.id ? `?material=${d.id}` : "?material=none"}`} className="focus-ring flex items-center justify-between gap-3 rounded-2xl border border-line bg-white/[0.03] p-3 hover:border-accent/40">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{d.title}</span>
                        <span className="text-xs text-fg-2">{d.total} cards</span>
                      </span>
                      <span className={d.due ? "text-sm font-semibold text-accent" : "text-xs text-muted"}>{d.due ? `${d.due} due` : "Up to date"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}
          <GlassCard className="p-5">
            <CardHeader title="All cards" />
            <div className="mt-3">
              {cards.length ? (
                <CardList cards={cards} materials={materials} />
              ) : (
                <EmptyState icon={<Layers className="size-6" />} title="No flashcards yet" description="Generate cards from a material, add your own, or take a quiz — mistakes become cards automatically." />
              )}
            </div>
          </GlassCard>
        </div>
        <GlassCard className="p-5 lg:sticky lg:top-24">
          <CardHeader title="Generate from a material" />
          <div className="mt-3">
            {isAIConfigured() ? <GenerateCards materials={materials} /> : <FormMessage tone="info">AI isn&apos;t configured on this server yet.</FormMessage>}
          </div>
          {!cards.length && materials.length > 0 && <div className="mt-4"><CardList cards={[]} materials={materials} /></div>}
        </GlassCard>
      </div>
    </div>
  );
}
