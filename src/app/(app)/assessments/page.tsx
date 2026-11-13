import type { Metadata } from "next";
import { ComingInPhase } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Assessments" };

export default function AssessmentsPage() {
  return (
    <ComingInPhase
      title="Quiz & Assessment"
      phase={5}
      description="Daily quizzes generated from exactly what you studied, with explanations, topics to revise and full history. Mock exams for final preparation."
      points={["MCQ, true/false, fill-in, short & theory", "Timed attempts & retries", "Explanations with source pages", "Topics mastered vs. to revise"]}
    />
  );
}
