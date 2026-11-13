import "server-only";
import { createClient } from "@/lib/supabase/server";
import { computeLeaves, type SectionRow } from "@/lib/materials/segmentation";
import { STUDY_WORDS_PER_MINUTE } from "@/lib/materials/structure";
import type { PlanMaterial, Unit } from "@/lib/planner/scheduler";

export type PlannableMaterial = { id: string; title: string; file_type: string; page_count: number | null; subject: string | null; unitCount: number; analysed: boolean };

export async function getPlannableMaterials(userId: string): Promise<PlannableMaterial[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .select("id, title, file_type, page_count, subjects(name), document_sections(level)")
    .eq("user_id", userId)
    .eq("status", "ready")
    .order("title");
  if (error) throw new Error("Could not load your materials.");
  return (data ?? []).map((m) => {
    const levels = ((m.document_sections ?? []) as { level: number }[]).map((s) => s.level);
    const subject = Array.isArray(m.subjects) ? m.subjects[0] : m.subjects;
    return {
      id: m.id,
      title: m.title,
      file_type: m.file_type,
      page_count: m.page_count,
      subject: (subject as { name: string } | null)?.name ?? null,
      unitCount: levels.filter((l) => l === 3).length || levels.length,
      analysed: levels.includes(3),
    };
  });
}

type SectionWithMeta = SectionRow & { estimated_minutes: number | null; complexity: number | null; learning_objectives: string[] };

/**
 * Loads schedulable units for materials, in the order given. Units are the leaf
 * sections (AI learning units where available). Materials without any structure
 * fall back to page groups of ~20 minutes, built from real word counts.
 */
export async function loadPlanMaterials(userId: string, materialIds: string[]): Promise<PlanMaterial[]> {
  const supabase = await createClient();
  const { data: materials, error } = await supabase
    .from("materials")
    .select("id, title, status, page_count")
    .eq("user_id", userId)
    .in("id", materialIds);
  if (error) throw new Error("Could not load materials.");
  const out: PlanMaterial[] = [];
  for (const id of materialIds) {
    const m = (materials ?? []).find((x) => x.id === id);
    if (!m || m.status !== "ready") continue;
    const { data: rows } = await supabase
      .from("document_sections")
      .select("id, parent_id, level, position, title, start_page, end_page, estimated_minutes, complexity, learning_objectives")
      .eq("material_id", id)
      .limit(5000);
    const sections = (rows ?? []) as SectionWithMeta[];
    const byId = new Map(sections.map((s) => [s.id, s]));
    let units: Unit[] = computeLeaves(sections).map((leaf) => {
      const s = byId.get(leaf.id)!;
      return {
        sectionId: s.id,
        materialId: id,
        materialTitle: m.title,
        chapterTitle: leaf.chapterTitle,
        title: s.title,
        startPage: s.start_page,
        endPage: s.end_page,
        minutes: Math.max(1, s.estimated_minutes ?? 10),
        complexity: s.complexity,
        objectives: s.learning_objectives ?? [],
      };
    });
    if (!units.length) units = await pageGroupUnits(id, m.title);
    out.push({ id, title: m.title, units });
  }
  return out;
}

async function pageGroupUnits(materialId: string, title: string): Promise<Unit[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("material_pages")
    .select("page_number, char_count")
    .eq("material_id", materialId)
    .order("page_number")
    .limit(5000);
  const pages = (data ?? []) as { page_number: number; char_count: number }[];
  const units: Unit[] = [];
  let start = 0;
  let words = 0;
  pages.forEach((p, i) => {
    if (!units.length && i === 0) start = p.page_number;
    words += p.char_count / 6;
    const last = i === pages.length - 1;
    if (words / STUDY_WORDS_PER_MINUTE >= 20 || last) {
      units.push({
        sectionId: null,
        materialId,
        materialTitle: title,
        chapterTitle: null,
        title: start === p.page_number ? `Page ${start}` : `Pages ${start}–${p.page_number}`,
        startPage: start,
        endPage: p.page_number,
        minutes: Math.max(1, Math.round(words / STUDY_WORDS_PER_MINUTE)),
        complexity: null,
        objectives: [],
      });
      start = pages[i + 1]?.page_number ?? start;
      words = 0;
    }
  });
  return units;
}

export type PlanListItem = {
  id: string;
  title: string;
  mode: "individual" | "combined";
  status: string;
  start_date: string;
  deadline: string;
  materials: string[];
  totalTasks: number;
  doneTasks: number;
  missedSessions: number;
  nextSession: { id: string; date: string; title: string } | null;
};

export async function listPlans(userId: string, today: string): Promise<PlanListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("study_plans")
    .select("id, title, mode, status, start_date, deadline, study_plan_materials(materials(title)), study_sessions(id, scheduled_date, title, status, kind), study_tasks(status)")
    .eq("user_id", userId)
    .in("status", ["active", "completed"])
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load your plans.");
  return (data ?? []).map((p) => {
    const sessions = (p.study_sessions ?? []) as { id: string; scheduled_date: string; title: string; status: string; kind: string }[];
    const tasks = (p.study_tasks ?? []) as { status: string }[];
    const open = sessions.filter((s) => s.status === "scheduled" || s.status === "in_progress");
    const next = open.filter((s) => s.scheduled_date >= today && s.kind !== "assessment").sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))[0];
    return {
      id: p.id,
      title: p.title,
      mode: p.mode,
      status: p.status,
      start_date: p.start_date,
      deadline: p.deadline,
      materials: ((p.study_plan_materials ?? []) as { materials: { title: string } | { title: string }[] | null }[])
        .map((l) => (Array.isArray(l.materials) ? l.materials[0]?.title : l.materials?.title))
        .filter((t): t is string => Boolean(t)),
      totalTasks: tasks.length,
      doneTasks: tasks.filter((t) => t.status === "completed").length,
      missedSessions: open.filter((s) => s.scheduled_date < today && s.kind !== "assessment").length,
      nextSession: next ? { id: next.id, date: next.scheduled_date, title: next.title } : null,
    };
  });
}

export type SessionTask = {
  id: string;
  session_id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  start_page: number | null;
  end_page: number | null;
  estimated_minutes: number;
  material_id: string | null;
  section_id: string | null;
  materialTitle: string | null;
};

export type PlanSession = {
  id: string;
  scheduled_date: string;
  planned_minutes: number;
  kind: "study" | "revision" | "assessment";
  status: "scheduled" | "in_progress" | "completed" | "missed" | "rescheduled";
  title: string;
  objectives: string[];
  tasks: SessionTask[];
};

export type PlanDetail = {
  id: string;
  title: string;
  mode: "individual" | "combined";
  status: string;
  start_date: string;
  deadline: string;
  daily_minutes: number;
  study_days: number[];
  workload: "light" | "balanced" | "intensive";
  version: number;
  materials: { id: string; title: string }[];
  sessions: PlanSession[];
};

export async function getPlan(userId: string, planId: string): Promise<PlanDetail | null> {
  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("study_plans")
    .select("id, title, mode, status, start_date, deadline, daily_minutes, study_days, workload, version, study_plan_materials(position, materials(id, title))")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!plan) return null;
  const [sessions, tasks] = await Promise.all([
    supabase
      .from("study_sessions")
      .select("id, scheduled_date, planned_minutes, kind, status, title, objectives")
      .eq("plan_id", planId)
      .order("scheduled_date")
      .order("kind")
      .limit(2000),
    supabase
      .from("study_tasks")
      .select("id, session_id, title, status, start_page, end_page, estimated_minutes, material_id, section_id, position, materials(title)")
      .eq("plan_id", planId)
      .order("position")
      .limit(5000),
  ]);
  const taskRows = (tasks.data ?? []) as (Omit<SessionTask, "materialTitle"> & { materials: { title: string } | { title: string }[] | null })[];
  const bySession = new Map<string, SessionTask[]>();
  for (const t of taskRows) {
    const mt = Array.isArray(t.materials) ? t.materials[0] : t.materials;
    const { materials: _m, ...rest } = t;
    void _m;
    const list = bySession.get(t.session_id) ?? [];
    list.push({ ...rest, materialTitle: mt?.title ?? null });
    bySession.set(t.session_id, list);
  }
  const links = ((plan.study_plan_materials ?? []) as { position: number; materials: { id: string; title: string } | { id: string; title: string }[] | null }[])
    .sort((a, b) => a.position - b.position)
    .map((l) => (Array.isArray(l.materials) ? l.materials[0] : l.materials))
    .filter((m): m is { id: string; title: string } => Boolean(m));
  return {
    ...(plan as unknown as Omit<PlanDetail, "materials" | "sessions">),
    materials: links,
    sessions: ((sessions.data ?? []) as Omit<PlanSession, "tasks">[]).map((s) => ({ ...s, tasks: bySession.get(s.id) ?? [] })),
  };
}
