"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BookOpenText, Check, PartyPopper, RotateCcw, X } from "lucide-react";
import { reviewCard } from "@/app/(app)/flashcards/actions";
import { buttonClasses } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/feedback";
import { SilkBackground } from "@/components/brand/silk-background";
import { cn } from "@/lib/utils/format";

export type ReviewCard = {
  id: string;
  front: string;
  back: string;
  explanation: string | null;
  source_page: number | null;
  material_id: string | null;
  materialTitle: string | null;
  origin: string;
};
type Rating = "difficult" | "practice" | "know";
type ReviewFn = typeof reviewCard;

const RATINGS: { r: Rating; label: string; icon: typeof X; cls: string; hint: string }[] = [
  { r: "difficult", label: "Difficult", icon: X, cls: "text-error border-error/40", hint: "Again in 10 min" },
  { r: "practice", label: "Need practice", icon: RotateCcw, cls: "text-fg border-line-strong", hint: "Tomorrow" },
  { r: "know", label: "Know it", icon: Check, cls: "text-accent border-accent/50", hint: "Later" },
];

export function FlashcardReview({ cards, review = reviewCard, title }: { cards: ReviewCard[]; review?: ReviewFn; title: string }) {
  const [queue, setQueue] = useState(cards);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState<Record<Rating, number>>({ difficult: 0, practice: 0, know: 0 });
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const card = queue[0];
  const total = cards.length;
  const reviewed = done.difficult + done.practice + done.know;

  const rate = (r: Rating) =>
    start(async () => {
      setError(undefined);
      const res = await review(card.id, r);
      if (!res.ok) return setError(res.error);
      setDone((d) => ({ ...d, [r]: d[r] + 1 }));
      setFlipped(false);
      // Difficult cards come back at the end of this session too.
      setQueue((q) => (r === "difficult" ? [...q.slice(1), q[0]] : q.slice(1)));
    });

  if (!card) {
    return (
      <div className="mx-auto max-w-md space-y-5 text-center">
        <PartyPopper className="mx-auto size-12 text-accent" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">Session complete</h1>
        <p className="text-fg-2">
          {reviewed} reviews · {done.know} known · {done.practice} to practise · {done.difficult} difficult
        </p>
        <p className="text-sm text-muted">Difficult cards will come back sooner so they stick.</p>
        <Link href="/flashcards" className={buttonClasses({ className: "w-full" })}>Back to flashcards</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Flashcards</h1>
        <p className="text-sm text-fg-2">{title} · {Math.min(reviewed + 1, total)} of {total}{queue.length > total - reviewed ? " (repeats)" : ""}</p>
      </div>
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Show question" : "Reveal answer"}
        className="focus-ring glass-strong relative flex min-h-[22rem] flex-col items-center justify-center overflow-hidden rounded-[1.75rem] p-7 text-center"
      >
        <SilkBackground variant="card" />
        <span className="relative text-[11px] font-semibold uppercase tracking-wide text-accent">
          {flipped ? "Answer" : card.origin === "quiz_mistake" ? "From a quiz mistake" : "Question"}
        </span>
        <span className="relative mt-4 text-xl font-semibold leading-snug">{flipped ? card.back : card.front}</span>
        {flipped && card.explanation && <span className="relative mt-4 text-sm text-fg-2">{card.explanation}</span>}
        {!flipped && <span className="relative mt-6 text-xs text-muted">Tap to reveal</span>}
      </button>
      {flipped && card.material_id && card.source_page && (
        <Link href={`/reader/${card.material_id}?page=${card.source_page}`} className="focus-ring mx-auto inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs">
          <BookOpenText className="size-3.5 text-accent" aria-hidden="true" /> {card.materialTitle ?? "Source"} · p. {card.source_page}
        </Link>
      )}
      {error && <FormMessage>{error}</FormMessage>}
      <div className="grid grid-cols-3 gap-3" role="group" aria-label="How well did you know it?">
        {RATINGS.map(({ r, label, icon: Icon, cls, hint }) => (
          <button
            key={r}
            type="button"
            disabled={!flipped || pending}
            onClick={() => rate(r)}
            className={cn("focus-ring flex flex-col items-center gap-1.5 rounded-2xl border bg-white/[0.03] py-3 text-xs font-semibold transition disabled:opacity-40", cls)}
          >
            <span className="flex size-11 items-center justify-center rounded-full border border-current/40"><Icon className="size-5" aria-hidden="true" /></span>
            {label}
            <span className="text-[10px] font-normal text-muted">{hint}</span>
          </button>
        ))}
      </div>
      {!flipped && <p className="text-center text-xs text-muted">Reveal the answer, then rate how well you knew it.</p>}
    </div>
  );
}
