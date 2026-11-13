import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AchievementRow, MaterialFileType, MaterialStatus, SessionKind } from "@/types/db";

export type DashboardStats = {
  today: string;
  materials_total: number;
  materials_ready: number;
  materials_processing: number;
  overall_completion: number;
  avg_quiz_score: number | null;
  quizzes_completed: number;
  total_study_minutes: number;
  today_minutes: number;
  tasks_today_total: number;
  tasks_today_done: number;
  week: { date: string; minutes: number; qualified: boolean }[];
  streak: { current_streak: number; longest_streak: number; last_qualifying_date: string | null } | null;
  xp: number;
};

export type MissionTask = {
  id: string;
  title: string;
  status: string;
  start_page: number | null;
  end_page: number | null;
  estimated_minutes: number;
  material: { id: string; title: string; file_type: MaterialFileType } | null;
  materialProgress: number;
};

export type UpcomingSession = {
  id: string;
  title: string;
  scheduled_date: string;
  planned_minutes: number;
  kind: SessionKind;
  taskCount: number;
};

export type RecentMaterial = {
  id: string;
  title: string;
  file_type: MaterialFileType;
  page_count: number | null;
  size_bytes: number;
  status: MaterialStatus;
  progress: number;
};

export type DashboardAchievement = AchievementRow & { earned_at: string | null };

export type DashboardData = {
  stats: DashboardStats;
  mission: MissionTask[];
  upcoming: UpcomingSession[];
  recent: RecentMaterial[];
  achievements: DashboardAchievement[];
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const supabase = await createClient();

  const { data: statsData, error: statsError } = await supabase.rpc("dashboard_stats");
  if (statsError || !statsData) throw new Error("Could not load your dashboard statistics.");
  const stats = statsData as DashboardStats;
  const today = stats.today;

  const [missionRes, upcomingRes, recentRes, catalogRes, earnedRes] = await Promise.all([
    supabase
      .from("study_tasks")
      .select(
        "id, title, status, start_page, end_page, estimated_minutes, position, material_id, study_sessions!inner(scheduled_date), materials(id, title, file_type)",
      )
      .eq("user_id", userId)
      .eq("study_sessions.scheduled_date", today)
      .order("position", { ascending: true })
      .limit(6),
    supabase
      .from("study_sessions")
      .select("id, title, scheduled_date, planned_minutes, kind, study_tasks(count)")
      .eq("user_id", userId)
      .gte("scheduled_date", today)
      .in("status", ["scheduled", "in_progress"])
      .order("scheduled_date", { ascending: true })
      .order("starts_at", { ascending: true, nullsFirst: false })
      .limit(3),
    supabase
      .from("materials")
      .select("id, title, file_type, page_count, size_bytes, status, reading_progress(percent_complete)")
      .eq("user_id", userId)
      .order("last_opened_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(4),
    supabase.from("achievements").select("id, code, name, description, icon, xp, sort_order").order("sort_order"),
    supabase.from("user_achievements").select("achievement_id, earned_at").eq("user_id", userId),
  ]);

  for (const r of [missionRes, upcomingRes, recentRes, catalogRes, earnedRes]) {
    if (r.error) throw new Error("Could not load your dashboard.");
  }

  const progressFor = (row: { reading_progress?: unknown }) => {
    const rp = one(row.reading_progress as { percent_complete: number } | { percent_complete: number }[] | null);
    return rp ? Number(rp.percent_complete) : 0;
  };

  const recent: RecentMaterial[] = (recentRes.data ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    file_type: m.file_type,
    page_count: m.page_count,
    size_bytes: m.size_bytes,
    status: m.status,
    progress: progressFor(m),
  }));

  // Reading progress for materials referenced by today's tasks.
  const missionRows = missionRes.data ?? [];
  const missionMaterialIds = [...new Set(missionRows.map((t) => t.material_id).filter(Boolean))] as string[];
  const progressMap = new Map<string, number>();
  if (missionMaterialIds.length) {
    const { data } = await supabase
      .from("reading_progress")
      .select("material_id, percent_complete")
      .eq("user_id", userId)
      .in("material_id", missionMaterialIds);
    for (const p of data ?? []) progressMap.set(p.material_id, Number(p.percent_complete));
  }

  const mission: MissionTask[] = missionRows.map((t) => {
    const material = one(t.materials as unknown as MissionTask["material"] | MissionTask["material"][]);
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      start_page: t.start_page,
      end_page: t.end_page,
      estimated_minutes: t.estimated_minutes,
      material,
      materialProgress: material ? (progressMap.get(material.id) ?? 0) : 0,
    };
  });

  const upcoming: UpcomingSession[] = (upcomingRes.data ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    scheduled_date: s.scheduled_date,
    planned_minutes: s.planned_minutes,
    kind: s.kind,
    taskCount: one(s.study_tasks as { count: number }[] | null)?.count ?? 0,
  }));

  const earned = new Map((earnedRes.data ?? []).map((e) => [e.achievement_id as string, e.earned_at as string]));
  const achievements: DashboardAchievement[] = ((catalogRes.data ?? []) as AchievementRow[]).map((a) => ({
    ...a,
    earned_at: earned.get(a.id) ?? null,
  }));

  return { stats, mission, upcoming, recent, achievements };
}
