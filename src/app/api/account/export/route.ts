import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

const TABLES = [
  "profiles", "subjects", "folders", "materials", "document_sections", "study_plans", "study_plan_materials",
  "study_sessions", "study_tasks", "reading_progress", "bookmarks", "highlights", "notes", "ai_conversations",
  "ai_messages", "quizzes", "quiz_attempts", "quiz_answers", "flashcards", "flashcard_reviews", "study_streaks",
  "user_achievements", "study_activity", "notifications", "subscriptions",
] as const;

/** GDPR-style export of the signed-in student's own data (RLS-scoped). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const supabase = await createClient();

  const { data: allowed } = await supabase.rpc("check_rate_limit", { p_key: "account:export", p_limit: 5, p_window_seconds: 3600 });
  if (allowed === false) return NextResponse.json({ error: "Too many exports. Try again later." }, { status: 429 });

  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), user: { id: user.id, email: user.email } };
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("*").limit(10000);
    out[table] = error ? { error: "unavailable" } : data;
  }
  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="mindflow-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
