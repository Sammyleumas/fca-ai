"use client";

import { useState } from "react";
import { QuizRunner } from "@/components/assessments/quiz-runner";
import { FlashcardReview } from "@/components/flashcards/review";

/** DEVELOPMENT-ONLY: real quiz runner and flashcard review with mocked server actions. */
export function AssessmentDemo({ screen }: { screen: "quiz" | "flashcards" }) {
  const [submitted, setSubmitted] = useState<string | null>(null);
  if (screen === "flashcards") {
    return (
      <FlashcardReview
        title="Introduction to Computer Science"
        review={async (_id, r) => ({ ok: true, dueAt: new Date().toISOString(), intervalDays: r === "know" ? 3 : 0 })}
        cards={[
          { id: "c1", front: "What is RAM?", back: "Random Access Memory — a type of memory that allows quick access to data.", explanation: "It is volatile: contents are lost when power is off.", source_page: 12, material_id: "m1", materialTitle: "Intro to CS", origin: "definition" },
          { id: "c2", front: "What does TCP guarantee?", back: "Reliable, ordered delivery of a byte stream.", explanation: null, source_page: 30, material_id: "m1", materialTitle: "Intro to CS", origin: "quiz_mistake" },
        ]}
      />
    );
  }
  if (submitted) return <p className="p-10 text-center" data-testid="submitted">Submitted {submitted}</p>;
  return (
    <QuizRunner
      title="Quiz & Assessment"
      attemptId="demo-attempt"
      startedAt={new Date().toISOString()}
      timeLimitSeconds={30 * 60}
      submit={async ({ attemptId }) => ({ ok: true, attemptId })}
      onSubmitted={setSubmitted}
      questions={[
        { id: "q1", position: 0, type: "mcq", prompt: "What is the primary purpose of a computer network?", options: ["To store data", "To connect different devices", "To provide power", "To encrypt files"], points: 1 },
        { id: "q2", position: 1, type: "true_false", prompt: "UDP guarantees that packets arrive in order.", options: [], points: 1 },
        { id: "q3", position: 2, type: "fill_blank", prompt: "TCP opens a connection with a _____ handshake.", options: [], points: 1 },
        { id: "q4", position: 3, type: "theory", prompt: "Explain why real-time video calls often use UDP rather than TCP.", options: [], points: 4 },
      ]}
    />
  );
}
