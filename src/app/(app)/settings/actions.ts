"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, passwordSchema } from "@/lib/validation/auth";
import { learningSettingsSchema, notificationPrefsSchema, profileSettingsSchema } from "@/lib/validation/profile";
import { z } from "zod";

export type SettingsState = { error?: string; success?: string; fields?: Record<string, string | undefined> };

export async function saveProfile(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const parsed = profileSettingsSchema.safeParse({
    preferred_name: formData.get("preferred_name"),
    full_name: formData.get("full_name") ?? "",
    education_level: formData.get("education_level") || null,
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
  if (error) return { error: "We couldn't save your profile. Please try again." };
  revalidatePath("/", "layout");
  return { success: "Profile saved." };
}

export async function saveLearning(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const parsed = learningSettingsSchema.safeParse({
    daily_study_minutes: formData.get("daily_study_minutes"),
    weekly_goal_minutes: formData.get("weekly_goal_minutes"),
    weekly_goal_days: formData.get("weekly_goal_days"),
    preferred_study_time: formData.get("preferred_study_time") || null,
    learning_goals: formData.getAll("learning_goals").map(String),
  });
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
  if (error) return { error: "We couldn't save your learning preferences." };
  revalidatePath("/", "layout");
  return { success: "Learning preferences saved." };
}

export async function saveNotifications(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const bool = (k: string) => formData.get(k) === "on";
  const parsed = notificationPrefsSchema.safeParse({
    daily_reminder: bool("daily_reminder"),
    reminder_time: formData.get("reminder_time") || "18:00",
    sessions: bool("sessions"),
    quizzes: bool("quizzes"),
    streaks: bool("streaks"),
    achievements: bool("achievements"),
    plan_changes: bool("plan_changes"),
    email: bool("email"),
  });
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ notification_prefs: parsed.data }).eq("id", user.id);
  if (error) return { error: "We couldn't save your notification settings." };
  return { success: "Notification settings saved." };
}

const changePasswordSchema = z
  .object({ current: z.string().min(1, "Enter your current password."), password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match.", path: ["confirm"] });

export async function changePassword(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  if (!user.email) return { error: "Password sign-in isn't enabled for this account." };
  const supabase = await createClient();
  // Re-authenticate before changing credentials.
  const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password: parsed.data.current });
  if (authError) return { fields: { current: "Your current password is incorrect." } };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.code === "same_password" ? "Choose a different password." : "We couldn't update your password." };
  return { success: "Password updated." };
}

export async function deleteAccount(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  if (String(formData.get("confirm") ?? "").trim() !== "DELETE") {
    return { fields: { confirm: 'Type DELETE to confirm.' } };
  }
  if (!hasAdminClient()) {
    return { error: "Account deletion is not configured on this server yet. Please contact support." };
  }
  const admin = createAdminClient();

  // 1. Remove stored files (paged; storage is not covered by database cascades).
  for (let round = 0; round < 50; round++) {
    const { data: folders } = await admin.storage.from("materials").list(user.id, { limit: 100 });
    if (!folders?.length) break;
    const paths: string[] = [];
    for (const folder of folders) {
      const { data: files } = await admin.storage.from("materials").list(`${user.id}/${folder.name}`, { limit: 1000 });
      if (files?.length) paths.push(...files.map((f) => `${user.id}/${folder.name}/${f.name}`));
      else paths.push(`${user.id}/${folder.name}`);
    }
    const { error } = await admin.storage.from("materials").remove(paths);
    if (error) return { error: "We couldn't remove your files. Nothing was deleted — please try again." };
  }

  // 2. Delete the auth user; every table cascades from auth.users.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: "We couldn't delete your account. Please try again." };

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
