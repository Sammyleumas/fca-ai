import type { Metadata } from "next";
import { ComingInPhase } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Flashcards" };

export default function FlashcardsPage() {
  return (
    <ComingInPhase
      title="Flashcards"
      phase={5}
      description="Cards generated from your materials and your quiz mistakes, scheduled with spaced repetition so difficult concepts come back more often."
      points={["Generated from your sources", "Hard / Again / Know ratings", "Spaced repetition scheduling", "Source page on every card"]}
    />
  );
}
