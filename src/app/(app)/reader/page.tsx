import type { Metadata } from "next";
import { ComingInPhase } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Reading Room" };

export default function ReaderPage() {
  return (
    <ComingInPhase
      title="Reading Room"
      phase={4}
      description="Read your original documents inside MindFlow with highlights, notes, bookmarks and an AI assistant that explains any passage — always clearly separated from the source."
      points={["Faithful document rendering", "Highlights, notes & bookmarks", "Resume exactly where you stopped", "Explain, summarise & quiz a passage"]}
    />
  );
}
