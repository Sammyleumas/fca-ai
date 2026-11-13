import { notFound } from "next/navigation";
import { AppFrame } from "@/components/layout/app-frame";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { TutorChat } from "@/components/tutor/chat";
import { TutorLayout } from "@/components/tutor/tutor-layout";
import { LibraryView } from "@/components/library/library-view";
import { PlanWizard } from "@/components/planner/plan-wizard";
import { PlanTimeline } from "@/components/planner/plan-timeline";
import { AnalyticsView } from "@/components/analytics/analytics-view";
import type { AnalyticsSummary } from "@/lib/analytics/insights";
import { buildPlan } from "@/lib/planner/scheduler";
import type { PlanDetail } from "@/lib/data/planner";
import { applyLibraryQuery, filterCounts, parseLibraryQuery, type LibraryItem } from "@/lib/materials/library-filter";
import type { DashboardData } from "@/lib/data/dashboard";
import { addDaysISO, lastNDates, localDateISO } from "@/lib/utils/dates";

/**
 * DEVELOPMENT-ONLY visual QA harness. Renders real UI components with clearly
 * fabricated sample data so layouts can be screenshot-tested without a database.
 * Returns 404 in production builds.
 */
function sample(empty: boolean): DashboardData {
  const today = localDateISO("UTC");
  const week = lastNDates(today, 7).map((date, i) => ({
    date,
    minutes: empty ? 0 : [20, 35, 30, 50, 45, 60, 40][i],
    qualified: !empty,
  }));
  if (empty) {
    return {
      stats: {
        today, materials_total: 0, materials_ready: 0, materials_processing: 0, overall_completion: 0, avg_quiz_score: null,
        quizzes_completed: 0, total_study_minutes: 0, today_minutes: 0, tasks_today_total: 0, tasks_today_done: 0, week,
        streak: { current_streak: 0, longest_streak: 0, last_qualifying_date: null }, xp: 0,
      },
      mission: [], upcoming: [], recent: [], achievements: [
        { id: "a1", code: "first_study_session", name: "First Study Session", description: "", icon: "star", xp: 50, sort_order: 1, earned_at: null },
        { id: "a2", code: "streak_7", name: "Seven-Day Streak", description: "", icon: "flame", xp: 100, sort_order: 2, earned_at: null },
        { id: "a3", code: "reading_champion", name: "Reading Champion", description: "", icon: "book-open", xp: 150, sort_order: 3, earned_at: null },
        { id: "a4", code: "quiz_master", name: "Quiz Master", description: "", icon: "trophy", xp: 200, sort_order: 4, earned_at: null },
      ],
    };
  }
  return {
    stats: {
      today, materials_total: 4, materials_ready: 4, materials_processing: 0, overall_completion: 68, avg_quiz_score: 85,
      quizzes_completed: 8, total_study_minutes: 720, today_minutes: 40, tasks_today_total: 3, tasks_today_done: 1, week,
      streak: { current_streak: 7, longest_streak: 9, last_qualifying_date: today }, xp: 1240,
    },
    mission: [
      { id: "t1", sessionId: "s0", title: "Read", status: "completed", start_page: 1, end_page: 10, estimated_minutes: 20, material: { id: "m1", title: "Introduction to Computer Science", file_type: "pdf" }, materialProgress: 68 },
      { id: "t2", sessionId: "s0", title: "Read", status: "pending", start_page: 11, end_page: 22, estimated_minutes: 30, material: { id: "m1", title: "Introduction to Computer Science", file_type: "pdf" }, materialProgress: 68 },
    ],
    upcoming: [
      { id: "s1", title: "Study: Computer Networks", scheduled_date: addDaysISO(today, 1), planned_minutes: 45, kind: "study", taskCount: 2 },
      { id: "s2", title: "Take Daily Quiz", scheduled_date: addDaysISO(today, 2), planned_minutes: 15, kind: "assessment", taskCount: 1 },
      { id: "s3", title: "Review: Database Systems", scheduled_date: addDaysISO(today, 3), planned_minutes: 60, kind: "revision", taskCount: 3 },
    ],
    recent: [
      { id: "m1", title: "Introduction to Computer Science", file_type: "pdf", page_count: 300, size_bytes: 2_500_000, status: "ready", progress: 68 },
      { id: "m2", title: "Database Management Systems", file_type: "pdf", page_count: 180, size_bytes: 1_800_000, status: "ready", progress: 24 },
      { id: "m3", title: "Software Engineering Notes", file_type: "docx", page_count: 95, size_bytes: 820_000, status: "ready", progress: 0 },
      { id: "m4", title: "Mathematics Lecture Notes", file_type: "pdf", page_count: null, size_bytes: 1_100_000, status: "analysing", progress: 0 },
    ],
    achievements: [
      { id: "a1", code: "first_study_session", name: "First Study Session", description: "", icon: "star", xp: 50, sort_order: 1, earned_at: "2026-11-01T10:00:00Z" },
      { id: "a2", code: "streak_7", name: "7-Day Streak", description: "", icon: "flame", xp: 100, sort_order: 2, earned_at: "2026-11-12T10:00:00Z" },
      { id: "a3", code: "reading_champion", name: "Top Reader", description: "", icon: "book-open", xp: 150, sort_order: 3, earned_at: "2026-11-10T10:00:00Z" },
      { id: "a4", code: "quiz_master", name: "Quiz Master", description: "", icon: "trophy", xp: 200, sort_order: 4, earned_at: null },
    ],
  };
}

function libraryItems(): LibraryItem[] {
  const base: Omit<LibraryItem, "id" | "title" | "file_type" | "size_bytes" | "page_count" | "status" | "created_at"> = {
    original_filename: "file.pdf", pages_are_estimated: false, status_detail: null, processing_progress: 100, processing_error: null,
    processing_warning: null, last_opened_at: null, subject: null, folder: null, progress: 0, lastReadAt: null, plans: [],
  };
  const now = new Date().toISOString();
  return [
    { ...base, id: "m1", title: "Introduction to Computer Science", file_type: "pdf", size_bytes: 2_516_582, page_count: 300, status: "ready", created_at: now, progress: 68, subject: { id: "s1", name: "Computer Science", kind: "subject" }, plans: [{ id: "p1", title: "Exam prep", status: "active" }] },
    { ...base, id: "m2", title: "Database Management Systems", file_type: "pdf", size_bytes: 1_887_436, page_count: 180, status: "ready", created_at: now, progress: 24 },
    { ...base, id: "m3", title: "Software Engineering Notes", file_type: "docx", size_bytes: 839_680, page_count: 95, pages_are_estimated: true, status: "ready", created_at: now, folder: { id: "f1", name: "Semester 1", kind: "folder" } },
    { ...base, id: "m4", title: "Mathematics Lecture Notes", file_type: "pdf", size_bytes: 1_153_434, page_count: null, status: "extracting", status_detail: "Recognising scanned pages (16/40)…", processing_progress: 58, created_at: now },
    { ...base, id: "m5", title: "Physics Revision Guide", file_type: "pdf", size_bytes: 983_040, page_count: null, status: "failed", processing_error: "This PDF is password-protected. Remove the password and upload it again.", created_at: now },
  ];
}

function samplePlan(): PlanDetail {
  const today = localDateISO("UTC");
  const titles = ["Introduction to CS", "Computer Networks", "TCP vs UDP", "Database Systems", "Normalisation", "Maths Revision", "Algorithms", "Complexity"];
  const r = buildPlan({
    materials: [{
      id: "m1", title: "Introduction to Computer Science",
      units: titles.map((t, i) => ({ sectionId: `u${i}`, materialId: "m1", materialTitle: "Intro to CS", chapterTitle: t, title: t, startPage: i * 22 + 1, endPage: i * 22 + 22, minutes: 35, complexity: 3, objectives: [`Explain ${t}`] })),
    }],
    startDate: addDaysISO(today, -1), deadline: addDaysISO(today, 12), dailyMinutes: 60, studyDays: [0, 1, 2, 3, 4, 5, 6], workload: "balanced",
  });
  let n = 0;
  return {
    id: "p1", title: "Intro to CS — exam prep", mode: "individual", status: "active", start_date: addDaysISO(today, -1), deadline: addDaysISO(today, 12),
    daily_minutes: 60, study_days: [0, 1, 2, 3, 4, 5, 6], workload: "balanced", version: 1, materials: [{ id: "m1", title: "Introduction to Computer Science" }],
    sessions: r.sessions.map((s, i) => ({
      id: `s${i}`, scheduled_date: s.date, planned_minutes: s.minutes, kind: s.kind, title: s.title, objectives: s.objectives,
      status: s.date < today ? "completed" : "scheduled",
      tasks: s.tasks.map((t) => ({
        id: `t${n++}`, session_id: `s${i}`, title: t.title, status: s.date < today ? "completed" : "pending", start_page: t.startPage, end_page: t.endPage,
        estimated_minutes: t.minutes, material_id: t.materialId, section_id: t.sectionId, materialTitle: "Intro to CS",
      })),
    })),
  };
}

function sampleAnalytics(): AnalyticsSummary {
  const today = localDateISO("UTC");
  const mins = [35, 50, 0, 42, 65, 30, 55, 20, 0, 48, 70, 40, 25, 60];
  const daily = lastNDates(today, 7).map((date, i) => ({ date, minutes: mins[i + 7], tasks: 1, quizzes: i % 3 === 0 ? 1 : 0, qualified: mins[i + 7] > 0 }));
  const heatmap = lastNDates(today, 84).map((date, i) => ({ date, minutes: (i * 37) % 7 === 0 ? 0 : ((i * 53) % 95) }));
  return {
    today, from: daily[0].date, days: 7, daily, heatmap,
    totals: { minutes: 283, prev_minutes: 220, reading_minutes: 160, active_days: 6, tasks_completed: 9, sessions_completed: 5, quizzes_completed: 8, flashcard_reviews: 64, avg_quiz: 81, prev_avg_quiz: 72, materials_completed: 1, materials_total: 4, overall_progress: 78, all_time_minutes: 720 },
    quiz_trend: [62, 70, 68, 78, 74, 85, 88, 95].map((p, i) => ({ date: daily[Math.min(6, i)].date, percent: p, title: `Daily quiz ${i + 1}`, kind: "daily" })),
    topics: [
      { topic: "Database normalisation", section_id: null, score: 3, max: 8, attempts: 2, percent: 38 },
      { topic: "Transport protocols", section_id: null, score: 5, max: 9, attempts: 3, percent: 56 },
      { topic: "Routing", section_id: null, score: 9, max: 10, attempts: 3, percent: 90 },
    ],
    materials: [
      { id: "1", title: "Intro to CS", subject: "Computer Science", minutes: 140, reading_percent: 68, quiz_avg: 92, quiz_count: 4 },
      { id: "2", title: "Maths notes", subject: "Mathematics", minutes: 80, reading_percent: 40, quiz_avg: 85, quiz_count: 2 },
      { id: "3", title: "Physics guide", subject: "Physics", minutes: 63, reading_percent: 20, quiz_avg: 73, quiz_count: 1 },
      { id: "4", title: "DB systems", subject: "Databases", minutes: 0, reading_percent: 10, quiz_avg: 52, quiz_count: 1 },
    ],
    week: { start: daily[0].date, minutes: 210, active_days: 4, quizzes: 2, flashcard_reviews: 18, tasks: 6, goal_minutes: 300, goal_days: 5 },
    streak: { current: 7, longest: 9, last: today },
  };
}

export default async function DevPreview({ params, searchParams }: PageProps<"/dev-preview/[screen]">) {
  const guest = (await searchParams).guest === "1";
  if (process.env.NODE_ENV !== "development") notFound();
  const { screen } = await params;
  const content =
    screen === "dashboard" || screen === "dashboard-empty" ? (
      <DashboardView data={sample(screen === "dashboard-empty")} name="Alex" greeting="Good morning" dailyGoal={60} plan="free" />
    ) : screen === "library" || screen === "library-upload" ? (
      <LibraryView
        items={applyLibraryQuery(libraryItems(), parseLibraryQuery({}))}
        total={5}
        counts={filterCounts(libraryItems())}
        query={parseLibraryQuery({})}
        subjects={[{ id: "s1", name: "Computer Science", kind: "subject", exam_date: null }]}
        folders={[{ id: "f1", name: "Semester 1", kind: "folder" }]}
        maxBytes={25 * 1024 * 1024}
        maxMaterials={5}
        uploadOpen={screen === "library-upload"}
        uploadsEnabled
      />
    ) : screen === "analytics" ? (
      <AnalyticsView s={sampleAnalytics()} range="7d" />
    ) : screen === "plan" ? (
      <div className="mx-auto max-w-4xl space-y-5">
        <h1 className="text-2xl font-semibold tracking-tight">Intro to CS — exam prep</h1>
        <PlanTimeline plan={samplePlan()} today={localDateISO("UTC")} />
      </div>
    ) : screen === "planner-new" ? (
      <div className="mx-auto max-w-6xl space-y-5">
        <h1 className="text-3xl font-semibold tracking-tight">New study plan</h1>
        <PlanWizard
          materials={[
            { id: "m1", title: "Introduction to Computer Science", file_type: "pdf", page_count: 300, subject: "Computer Science", unitCount: 48, analysed: true },
            { id: "m2", title: "Database Management Systems", file_type: "pdf", page_count: 180, subject: null, unitCount: 12, analysed: false },
            { id: "m3", title: "Software Engineering Notes", file_type: "docx", page_count: 95, subject: null, unitCount: 0, analysed: false },
          ]}
          preselected={["m1", "m2"]}
          today={localDateISO("UTC")}
          defaultDailyMinutes={60}
        />
      </div>
    ) : screen === "tutor" ? (
      <TutorLayout conversations={[{ id: "c1", title: "How does TCP differ from UDP?", updated_at: "" }]}>
        <TutorChat
          initialMessages={[
            { id: "1", role: "user", content: "How does TCP differ from UDP?" },
            { id: "2", role: "assistant", content: "**TCP** is connection-oriented and reliable; **UDP** is connectionless and faster.\n\n- TCP guarantees ordered delivery\n- UDP suits real-time apps like `VoIP`" },
          ]}
          name="Alex"
        />
      </TutorLayout>
    ) : null;
  if (!content) notFound();
  return (
    <AppFrame name={guest ? "Guest" : "Alex Chen"} avatarUrl={null} plan="free" unread={2} isGuest={guest}>
      {content}
    </AppFrame>
  );
}
