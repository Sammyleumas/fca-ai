import type { Metadata } from "next";
import { StudyPage } from "@/components/study/study-page";

export const metadata: Metadata = {
  title: "Study",
  description: "Paste or upload your notes, ask the AI tutor, take a quiz and review flashcards. No sign-up.",
};

/** The study app. Needs no account or database (only the AI service). */
export default function Study() {
  return <StudyPage />;
}
