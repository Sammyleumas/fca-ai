/**
 * Row types for the tables MindFlow reads. These mirror supabase/migrations.
 * Regenerate full types with `npx supabase gen types typescript --linked` once a
 * project is linked; these hand-written types keep the data layer explicit.
 */
export type EducationLevel =
  | "secondary"
  | "undergraduate"
  | "postgraduate"
  | "professional"
  | "exam_candidate"
  | "independent"
  | "other";

export type MaterialStatus = "uploaded" | "queued" | "extracting" | "analysing" | "structuring" | "ready" | "failed";
export type MaterialFileType = "pdf" | "docx" | "txt";
export type SessionKind = "study" | "revision" | "assessment";
export type SessionStatus = "scheduled" | "in_progress" | "completed" | "missed" | "rescheduled";
export type TaskStatus = "pending" | "in_progress" | "completed" | "skipped";
export type SubscriptionPlan = "free" | "premium";

export interface NotificationPrefs {
  daily_reminder: boolean;
  reminder_time: string; // HH:MM in the student's time zone
  sessions: boolean;
  quizzes: boolean;
  streaks: boolean;
  achievements: boolean;
  plan_changes: boolean;
  email: boolean;
}

export interface ProfileRow {
  id: string;
  preferred_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  education_level: EducationLevel | null;
  learning_goals: string[];
  daily_study_minutes: number;
  preferred_study_time: "morning" | "afternoon" | "evening" | "night" | "flexible" | null;
  timezone: string;
  notification_prefs: NotificationPrefs;
  reading_prefs: Record<string, unknown>;
  theme: "dark" | "light" | "system";
  xp: number;
  onboarding_completed_at: string | null;
  created_at: string;
}

export interface SubjectRow {
  id: string;
  name: string;
  kind: "subject" | "course" | "examination";
  exam_date: string | null;
}

export interface MaterialRow {
  id: string;
  title: string;
  file_type: MaterialFileType;
  size_bytes: number;
  page_count: number | null;
  status: MaterialStatus;
  created_at: string;
  last_opened_at: string | null;
}

export interface StudyStreakRow {
  current_streak: number;
  longest_streak: number;
  last_qualifying_date: string | null;
}

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  scheduled_for: string;
  read_at: string | null;
}

export interface AchievementRow {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  xp: number;
  sort_order: number;
}
