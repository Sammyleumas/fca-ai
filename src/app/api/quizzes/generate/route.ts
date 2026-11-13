import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AIError, getAIProvider } from "@/lib/ai";
import { assertAIAllowed } from "@/lib/ai/guard";
import { QUESTION_TYPES, type QuestionType } from "@/lib/assessments/questions";
import { generateQuiz } from "@/lib/assessments/service";
import { loadExcerpts, type SourceRange } from "@/lib/assessments/sources";
import { getSessionUser } from "@/lib/auth/dal";
import { limitsFor } from "@/lib/billing/plans";
import { getShellData } from "@/lib/data/shell";
import { computeLeaves, type SectionRow } from "@/lib/materials/segmentation";
import { hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

const types = z.array(z.enum(QUESTION_TYPES as [QuestionType, ...QuestionType[]])).min(1);
const schema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("session"), sessionId: z.uuid() }),
  z.object({
    source: z.literal("material"),
    materialId: z.uuid(),
    sectionIds: z.array(z.uuid()).max(50).optional(),
    kind: z.enum(["practice", "mock"]),
    count: z.number().int().min(3).max(40),
    types,
    timed: z.boolean(),
  }),
  z.object({ source: z.literal("plan"), planId: z.uuid(), count: z.number().int().min(5).max(40), types, timed: z.boolean() }),
]);

/** Spreads a long list evenly down to n items. */
function spread<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  return Array.from({ length: n }, (_, i) => list[Math.floor((i * list.length) / n)]);
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  const body = parsed.data;
  if (!hasAdminClient()) return NextResponse.json({ error: "Assessments aren't configured on this server yet." }, { status: 503 });

  const supabase = await createClient();

  // Daily quiz: reuse a live one for this session.
  if (body.source === "session") {
    const { data: existing } = await supabase.from("quizzes").select("id, status").eq("session_id", body.sessionId).eq("kind", "daily").neq("status", "failed").maybeSingle();
    if (existing) return NextResponse.json({ quizId: existing.id });
  }

  try {
    getAIProvider();
    await assertAIAllowed(user.id, "quiz");
  } catch (e) {
    if (e instanceof AIError) return NextResponse.json({ error: e.message }, { status: e.code === "not_configured" ? 503 : 429 });
    return NextResponse.json({ error: "The quiz generator is unavailable right now." }, { status: 503 });
  }
  const { plan } = await getShellData(user.id);
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count: recent } = await supabase.from("quizzes").select("id", { count: "exact", head: true }).eq("user_id", user.id).neq("status", "failed").gte("created_at", since);
  if ((recent ?? 0) >= limitsFor(plan).quizzesPerDay) {
    return NextResponse.json({ error: `You've reached today's limit of ${limitsFor(plan).quizzesPerDay} AI quizzes on the ${limitsFor(plan).label} plan.` }, { status: 429 });
  }

  let ranges: SourceRange[] = [];
  let spec: Parameters<typeof generateQuiz>[0];

  if (body.source === "session") {
    const { data: s } = await supabase.from("study_sessions").select("id, plan_id, scheduled_date, kind").eq("id", body.sessionId).maybeSingle();
    if (!s || s.kind !== "assessment") return NextResponse.json({ error: "Quiz session not found." }, { status: 404 });
    // The day's study tasks (including rescheduled ones that landed on this date).
    const { data: tasks } = await supabase
      .from("study_tasks")
      .select("material_id, section_id, title, start_page, end_page, study_sessions!inner(scheduled_date, kind, status)")
      .eq("plan_id", s.plan_id)
      .eq("study_sessions.scheduled_date", s.scheduled_date)
      .in("study_sessions.kind", ["study", "revision"])
      .not("study_sessions.status", "in", "(missed,rescheduled)");
    ranges = (tasks ?? [])
      .filter((t) => t.material_id && t.start_page)
      .map((t) => ({ materialId: t.material_id as string, sectionId: t.section_id, title: (t.title as string).replace(/^Review: /, "").replace(/ \(part \d+ of \d+\)$/, ""), start: t.start_page as number, end: (t.end_page as number) ?? (t.start_page as number) }));
    if (!ranges.length) return NextResponse.json({ error: "There are no study sections assigned to this day yet." }, { status: 400 });
    spec = { userId: user.id, title: "Daily quiz", kind: "daily", sessionId: s.id, planId: s.plan_id, count: Math.min(10, Math.max(5, ranges.length * 3)), types: ["mcq", "true_false", "fill_blank", "short_answer"], timeLimitSeconds: 15 * 60 };
  } else if (body.source === "material") {
    const { data: m } = await supabase.from("materials").select("id, title, status, page_count").eq("id", body.materialId).maybeSingle();
    if (!m || m.status !== "ready") return NextResponse.json({ error: "Material not ready." }, { status: 404 });
    const { data: secs } = await supabase.from("document_sections").select("id, parent_id, level, position, title, start_page, end_page").eq("material_id", m.id).limit(5000);
    const all = (secs ?? []) as SectionRow[];
    const chosen: { id: string; title: string; start_page: number; end_page: number }[] = body.sectionIds?.length
      ? all.filter((x) => body.sectionIds!.includes(x.id))
      : computeLeaves(all);
    ranges = spread(chosen, body.kind === "mock" ? 16 : 10).map((x) => ({ materialId: m.id, sectionId: x.id, title: x.title, start: x.start_page, end: x.end_page }));
    if (!ranges.length) ranges = [{ materialId: m.id, sectionId: null, title: null, start: 1, end: Math.max(1, m.page_count ?? 1) }];
    spec = {
      userId: user.id,
      title: `${body.kind === "mock" ? "Mock exam" : "Practice quiz"}: ${m.title}`,
      kind: body.kind,
      materialId: m.id,
      count: body.count,
      types: body.types,
      timeLimitSeconds: body.timed ? Math.max(5, Math.round(body.count * (body.kind === "mock" ? 2 : 1.5))) * 60 : null,
    };
  } else {
    const { data: p } = await supabase.from("study_plans").select("id, title").eq("id", body.planId).maybeSingle();
    if (!p) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
    const { data: tasks } = await supabase.from("study_tasks").select("material_id, section_id, title, start_page, end_page, status").eq("plan_id", p.id).not("title", "like", "Review:%");
    const list = (tasks ?? []).filter((t) => t.material_id && t.start_page);
    // Prefer what has been studied; fall back to everything.
    const done = list.filter((t) => t.status === "completed");
    ranges = spread(done.length >= 4 ? done : list, 16).map((t) => ({ materialId: t.material_id as string, sectionId: t.section_id, title: t.title as string, start: t.start_page as number, end: (t.end_page as number) ?? (t.start_page as number) }));
    if (!ranges.length) return NextResponse.json({ error: "This plan has no sections to test yet." }, { status: 400 });
    spec = { userId: user.id, title: `Mock exam: ${p.title}`, kind: "mock", planId: p.id, count: body.count, types: body.types, timeLimitSeconds: body.timed ? body.count * 2 * 60 : null };
  }

  const excerpts = await loadExcerpts(ranges);
  const result = await generateQuiz(spec, excerpts);
  if (result.error) return NextResponse.json({ quizId: result.quizId, error: result.error }, { status: 422 });
  return NextResponse.json({ quizId: result.quizId });
}
