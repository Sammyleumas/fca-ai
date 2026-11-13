import { z } from "zod";
import { safeTimeZone } from "@/lib/utils/dates";

export const EDUCATION_LEVELS = [
  { value: "secondary", label: "Secondary school" },
  { value: "undergraduate", label: "University (undergraduate)" },
  { value: "postgraduate", label: "University (postgraduate)" },
  { value: "exam_candidate", label: "Examination candidate" },
  { value: "professional", label: "Working professional" },
  { value: "independent", label: "Independent learner" },
  { value: "other", label: "Something else" },
] as const;

export const LEARNING_GOALS = [
  "Pass an upcoming exam",
  "Keep up with coursework",
  "Understand difficult topics",
  "Build a consistent study habit",
  "Revise efficiently",
  "Learn a new skill",
] as const;

export const STUDY_TIMES = ["morning", "afternoon", "evening", "night", "flexible"] as const;

const name = z.string().trim().min(1, "Tell us what to call you.").max(60, "Keep it under 60 characters.");

const subjectList = z
  .array(z.string().trim().min(1).max(120))
  .max(20, "Add up to 20 subjects for now.")
  .default([])
  .transform((list) => {
    const seen = new Set<string>();
    return list.filter((s) => {
      const k = s.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  });

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const notificationPrefsSchema = z.object({
  daily_reminder: z.boolean().default(true),
  reminder_time: timeOfDay.default("18:00"),
  sessions: z.boolean().default(true),
  quizzes: z.boolean().default(true),
  streaks: z.boolean().default(true),
  achievements: z.boolean().default(true),
  plan_changes: z.boolean().default(true),
  email: z.boolean().default(false),
});

/** Only the preferred name is required; every other step can be skipped. */
export const onboardingSchema = z.object({
  preferred_name: name,
  education_level: z.enum(EDUCATION_LEVELS.map((e) => e.value) as [string, ...string[]]).nullable().optional(),
  subjects: subjectList,
  learning_goals: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
  daily_study_minutes: z.coerce.number().int().min(10, "At least 10 minutes.").max(720).default(60),
  preferred_study_time: z.enum(STUDY_TIMES).nullable().optional(),
  timezone: z.string().max(64).transform((tz) => safeTimeZone(tz)),
  notification_prefs: notificationPrefsSchema.optional(),
});
export type OnboardingInput = z.input<typeof onboardingSchema>;

export const profileSettingsSchema = z.object({
  preferred_name: name,
  full_name: z.string().trim().max(120).optional().transform((v) => v || null),
  education_level: z.enum(EDUCATION_LEVELS.map((e) => e.value) as [string, ...string[]]).nullable().optional(),
  timezone: z.string().max(64).transform((tz) => safeTimeZone(tz)),
});

export const learningSettingsSchema = z.object({
  daily_study_minutes: z.coerce.number().int().min(10).max(720),
  weekly_goal_minutes: z.coerce.number().int().min(30, "At least 30 minutes a week.").max(5040),
  weekly_goal_days: z.coerce.number().int().min(1).max(7),
  preferred_study_time: z.enum(STUDY_TIMES).nullable(),
  learning_goals: z.array(z.string().trim().min(1).max(120)).max(10),
});
