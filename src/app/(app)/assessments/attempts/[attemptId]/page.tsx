import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ResultsView, type ResultsData, type ReviewItem } from "@/components/assessments/results-view";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Results" };

export default async function AttemptPage({ params }: PageProps<"/assessments/attempts/[attemptId]">) {
  const { attemptId } = await params;
  if (!z.uuid().safeParse(attemptId).success) notFound();
  await requireOnboardedUser();
  const supabase = await createClient();
  const { data: attempt } = await supabase
    .from("quiz_attempts")
    .select("id, quiz_id, status, score, max_score, percent, ungraded_count, feedback, quizzes(id, title, kind)")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt) notFound();
  if (attempt.status === "in_progress") redirect(`/assessments/${attempt.quiz_id}/take?attempt=${attemptId}`);

  const { data: review } = await supabase.rpc("get_attempt_review", { p_attempt_id: attemptId });
  const items = (review ?? []) as ReviewItem[];
  const materialIds = [...new Set(items.map((i) => i.source_material_id).filter(Boolean))] as string[];
  const feedback = (attempt.feedback ?? {}) as ResultsData["feedback"];
  const sectionIds = [...new Set((feedback.topics ?? []).map((t) => t.sectionId).filter(Boolean))] as string[];
  const [mats, secs, cards] = await Promise.all([
    materialIds.length ? supabase.from("materials").select("id, title").in("id", materialIds) : Promise.resolve({ data: [] }),
    sectionIds.length ? supabase.from("document_sections").select("id, material_id, start_page").in("id", sectionIds) : Promise.resolve({ data: [] }),
    supabase.from("flashcards").select("id", { count: "exact", head: true }).in("source_question_id", items.map((i) => i.question_id)),
  ]);
  const quiz = (Array.isArray(attempt.quizzes) ? attempt.quizzes[0] : attempt.quizzes) as ResultsData["quiz"];

  return (
    <ResultsView
      data={{
        quiz,
        attempt: { score: Number(attempt.score), max_score: Number(attempt.max_score), percent: Number(attempt.percent), ungraded_count: attempt.ungraded_count },
        feedback,
        items,
        materialTitles: Object.fromEntries(((mats.data ?? []) as { id: string; title: string }[]).map((m) => [m.id, m.title])),
        sectionPages: Object.fromEntries(((secs.data ?? []) as { id: string; material_id: string; start_page: number }[]).map((s) => [s.id, { materialId: s.material_id, page: s.start_page }])),
        newFlashcards: cards.count ?? 0,
      }}
    />
  );
}
