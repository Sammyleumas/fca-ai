import { notFound } from "next/navigation";
import { AppFrame } from "@/components/layout/app-frame";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { TutorChat } from "@/components/tutor/chat";
import { TutorLayout } from "@/components/tutor/tutor-layout";
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
      { id: "t1", title: "Read", status: "completed", start_page: 1, end_page: 10, estimated_minutes: 20, material: { id: "m1", title: "Introduction to Computer Science", file_type: "pdf" }, materialProgress: 68 },
      { id: "t2", title: "Read", status: "pending", start_page: 11, end_page: 22, estimated_minutes: 30, material: { id: "m1", title: "Introduction to Computer Science", file_type: "pdf" }, materialProgress: 68 },
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

export default async function DevPreview({ params }: PageProps<"/dev-preview/[screen]">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { screen } = await params;
  const content =
    screen === "dashboard" || screen === "dashboard-empty" ? (
      <DashboardView data={sample(screen === "dashboard-empty")} name="Alex" greeting="Good morning" dailyGoal={60} plan="free" />
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
    <AppFrame name="Alex Chen" avatarUrl={null} plan="free" unread={2}>
      {content}
    </AppFrame>
  );
}
