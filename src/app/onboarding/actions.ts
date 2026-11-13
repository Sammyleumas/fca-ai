"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { onboardingSchema } from "@/lib/validation/profile";

export type OnboardingState = { error?: string };

export async function completeOnboarding(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const user = await requireUser();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { error: "Something went wrong reading your answers. Please try again." };
  }
  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check your answers." };
  const input = parsed.data;

  const supabase = await createClient();
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      preferred_name: input.preferred_name,
      education_level: input.education_level ?? null,
      learning_goals: input.learning_goals,
      daily_study_minutes: input.daily_study_minutes,
      preferred_study_time: input.preferred_study_time ?? null,
      timezone: input.timezone,
      ...(input.notification_prefs ? { notification_prefs: input.notification_prefs } : {}),
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (profileError) return { error: "We couldn't save your profile. Please try again." };

  if (input.subjects.length) {
    const { error: subjectError } = await supabase.from("subjects").upsert(
      input.subjects.map((name) => ({ user_id: user.id, name, kind: "subject" as const })),
      { onConflict: "user_id,kind,name", ignoreDuplicates: true },
    );
    // Subjects are non-essential: the student can add them later from the library.
    if (subjectError) console.error("onboarding: subjects upsert failed", subjectError.code);
  }

  redirect("/dashboard?welcome=1");
}
