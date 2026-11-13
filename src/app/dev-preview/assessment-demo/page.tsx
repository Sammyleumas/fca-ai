import { notFound } from "next/navigation";
import { AppFrame } from "@/components/layout/app-frame";
import { ResultsView } from "@/components/assessments/results-view";
import { AssessmentDemo } from "./demo";

/** DEVELOPMENT-ONLY preview of assessment screens with labelled sample data. */
export default async function Page({ searchParams }: PageProps<"/dev-preview/assessment-demo">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const sp = await searchParams;
  const screen = sp.screen === "results" ? "results" : sp.screen === "flashcards" ? "flashcards" : "quiz";
  return (
    <AppFrame name="Alex Chen" avatarUrl={null} plan="free" unread={0}>
      {screen === "results" ? (
        <ResultsView
          data={{
            quiz: { id: "q", title: "Daily quiz", kind: "daily" },
            attempt: { score: 6.5, max_score: 8, percent: 81.3, ungraded_count: 0 },
            feedback: {
              correct: 5, incorrect: 1, elapsed_seconds: 540,
              topics: [
                { topic: "Transport protocols", sectionId: "s2", percent: 50, score: 2, max: 4 },
                { topic: "Network types", sectionId: "s1", percent: 100, score: 4, max: 4 },
              ],
            },
            items: [
              { question_id: "a", question_position: 0, question_type: "mcq", prompt: "What is the primary purpose of a computer network?", options: ["To store data", "To connect different devices", "To provide power", "To encrypt files"], correct_answer: { option: 1 }, explanation: "Networks exist to let devices communicate and share resources.", topic: "Network types", source_material_id: "m1", source_page: 2, answer: { option: 1 }, is_correct: true, points: 1, points_awarded: 1, feedback: null },
              { question_id: "b", question_position: 1, question_type: "true_false", prompt: "UDP guarantees ordered delivery.", options: [], correct_answer: { value: false }, explanation: "UDP is connectionless and gives no ordering guarantee.", topic: "Transport protocols", source_material_id: "m1", source_page: 3, answer: { value: true }, is_correct: false, points: 1, points_awarded: 0, feedback: null },
              { question_id: "c", question_position: 2, question_type: "theory", prompt: "Explain why video calls often use UDP.", options: [], correct_answer: { model_answer: "Low latency matters more than retransmitting lost packets.", key_points: ["latency"] }, explanation: null, topic: "Transport protocols", source_material_id: "m1", source_page: 3, answer: { text: "Because it is faster." }, is_correct: false, points: 4, points_awarded: 2, feedback: "You identified speed; mention why retransmission hurts real-time audio." },
            ],
            materialTitles: { m1: "Introduction to Computer Science" },
            sectionPages: { s2: { materialId: "m1", page: 3 } },
            newFlashcards: 1,
          }}
        />
      ) : (
        <AssessmentDemo screen={screen} />
      )}
    </AppFrame>
  );
}
