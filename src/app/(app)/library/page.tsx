import type { Metadata } from "next";
import { ComingInPhase } from "@/components/coming-soon";

export const metadata: Metadata = { title: "My Library" };

export default function LibraryPage() {
  return (
    <ComingInPhase
      title="My Library"
      phase={2}
      description="Upload many documents at once, organise them into subjects, courses, exams and folders, and let MindFlow process them into study-ready sections."
      points={["Multi-file drag & drop upload", "PDF, DOCX and TXT support", "Subjects, folders & collections", "Processing status with retries"]}
    />
  );
}
