import type { Metadata } from "next";
import { StudyPage } from "@/components/study/study-page";

export const metadata: Metadata = {
  title: "Study with FCA-AI — no account needed",
  description: "Paste or upload your notes, ask the AI tutor, take a quiz and review flashcards. No sign-up.",
};

/** Works without an account or the database (only the AI service is needed). */
export default function TryPage() {
  return <StudyPage />;
}
