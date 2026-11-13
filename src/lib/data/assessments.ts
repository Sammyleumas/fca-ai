import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { QuizSourceMaterial } from "@/components/assessments/quiz-launchers";

export type QuizListItem = {
  id: string;
  title: string;
  kind: "daily" | "practice" | "mock";
  status: "generating" | "ready" | "failed";
  question_count: number;
  created_at: string;
  attempts: { id: string; percent: number | null; status: string; submitted_at: string | null }[];
};

export async function listQuizzes(userId: string): Promise<QuizListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("quizzes")
    .select("id, title, kind, status, question_count, created_at, attempts:quiz_attempts(id, percent, status, submitted_at)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []) as QuizListItem[];
}

export async function getQuizSources(userId: string): Promise<{ materials: QuizSourceMaterial[]; plans: { id: string; title: string }[] }> {
  const supabase = await createClient();
  const [mats, plans] = await Promise.all([
    supabase.from("materials").select("id, title, document_sections(id, title, level, start_page)").eq("user_id", userId).eq("status", "ready").order("title"),
    supabase.from("study_plans").select("id, title").eq("user_id", userId).in("status", ["active", "completed"]).order("created_at", { ascending: false }),
  ]);
  return {
    materials: (mats.data ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      chapters: ((m.document_sections ?? []) as { id: string; title: string; level: number; start_page: number }[])
        .filter((s) => s.level === 1)
        .sort((a, b) => a.start_page - b.start_page)
        .map((s) => ({ id: s.id, title: s.title })),
    })),
    plans: (plans.data ?? []) as { id: string; title: string }[],
  };
}
