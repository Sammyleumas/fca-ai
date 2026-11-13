"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getProfile, requireUser } from "@/lib/auth/dal";
import { limitsFor } from "@/lib/billing/plans";
import { getShellData } from "@/lib/data/shell";
import { getPlan, loadPlanMaterials } from "@/lib/data/planner";
import { buildPlan, proposeReschedule, type PlanResult, type RescheduleProposal } from "@/lib/planner/scheduler";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, localDateISO } from "@/lib/utils/dates";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const uuid = z.uuid();

const planInputSchema = z
  .object({
    title: z.string().trim().max(200).optional(),
    materialIds: z.array(uuid).min(1, "Choose at least one material.").max(20, "Choose up to 20 materials."),
    startDate: z.iso.date(),
    deadline: z.iso.date(),
    dailyMinutes: z.coerce.number().int().min(10, "At least 10 minutes a day.").max(720),
    studyDays: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one study day."),
    preferredTime: z.enum(["morning", "afternoon", "evening", "night", "flexible"]).nullable().optional(),
    workload: z.enum(["light", "balanced", "intensive"]),
  })
  .refine((v) => v.deadline >= v.startDate, { message: "The deadline must be on or after the start date.", path: ["deadline"] });

export type PlanInputForm = z.input<typeof planInputSchema>;
export type PlanPreview = { result: PlanResult; materials: { id: string; title: string; units: number }[] };

async function today(userId: string) {
  const profile = await getProfile(userId);
  return localDateISO(profile?.timezone ?? "UTC");
}

async function computePlan(userId: string, input: z.infer<typeof planInputSchema>) {
  const materials = await loadPlanMaterials(userId, [...new Set(input.materialIds)]);
  if (!materials.length) return { error: "None of the selected materials are ready yet." } as const;
  const result = buildPlan({
    materials,
    startDate: input.startDate,
    deadline: input.deadline,
    dailyMinutes: input.dailyMinutes,
    studyDays: input.studyDays,
    workload: input.workload,
  });
  return { materials, result } as const;
}

export async function previewPlan(form: PlanInputForm): Promise<Result<{ preview: PlanPreview }>> {
  const user = await requireUser();
  const parsed = planInputSchema.safeParse(form);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the plan settings." };
  if (parsed.data.startDate < addDaysISO(await today(user.id), -1)) return { ok: false, error: "The start date can't be in the past." };
  const computed = await computePlan(user.id, parsed.data);
  if ("error" in computed) return { ok: false, error: computed.error! };
  return {
    ok: true,
    preview: {
      result: computed.result,
      materials: computed.materials.map((m) => ({ id: m.id, title: m.title, units: m.units.length })),
    },
  };
}

/** Recomputes the plan on the server (never trusts client-sent sessions) and saves it atomically. */
export async function createPlan(form: PlanInputForm): Promise<Result> {
  const user = await requireUser();
  const parsed = planInputSchema.safeParse(form);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the plan settings." };
  const input = parsed.data;

  const supabase = await createClient();
  const { plan } = await getShellData(user.id);
  const { count } = await supabase
    .from("study_plans")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "active");
  if ((count ?? 0) >= limitsFor(plan).activeStudyPlans) {
    return { ok: false, error: `Your plan allows ${limitsFor(plan).activeStudyPlans} active study plans. Archive one first.` };
  }

  const computed = await computePlan(user.id, input);
  if ("error" in computed) return { ok: false, error: computed.error! };
  const { result, materials } = computed;
  if (!result.summary.feasible) return { ok: false, error: "This plan doesn't fit before the deadline. Adjust the settings first." };

  const title =
    input.title ||
    (materials.length === 1 ? `${materials[0].title}` : `Combined plan: ${materials.map((m) => m.title).slice(0, 2).join(" & ")}${materials.length > 2 ? ` +${materials.length - 2}` : ""}`);
  const { data, error } = await supabase.rpc("create_study_plan", {
    p: {
      title: title.slice(0, 200),
      mode: materials.length > 1 ? "combined" : "individual",
      start_date: input.startDate,
      deadline: input.deadline,
      daily_minutes: input.dailyMinutes,
      study_days: input.studyDays,
      preferred_time: input.preferredTime ?? null,
      workload: input.workload,
      material_ids: materials.map((m) => m.id),
      meta: { engine: "fca-ai-scheduler-v1", summary: result.summary, warnings: result.warnings },
      sessions: result.sessions.map((s) => ({
        date: s.date,
        kind: s.kind,
        title: s.title,
        minutes: s.minutes,
        objectives: s.objectives,
        tasks: s.tasks.map((t) => ({
          material_id: t.materialId,
          section_id: t.sectionId,
          title: t.title,
          start_page: t.startPage,
          end_page: t.endPage,
          minutes: t.minutes,
        })),
      })),
    },
  });
  if (error || !data) return { ok: false, error: "We couldn't save this plan. Please try again." };
  revalidatePath("/planner");
  revalidatePath("/dashboard");
  revalidatePath("/library");
  redirect(`/planner/${data as string}?created=1`);
}

/* ------------------------------------------------------------- task progress */

export type CompleteResult = Result<{
  sessionCompleted: boolean;
  streak?: number;
  newAchievements?: { name: string }[];
}>;

export async function setTaskDone(taskId: string, done: boolean): Promise<CompleteResult> {
  await requireUser();
  if (!uuid.safeParse(taskId).success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { data: task } = await supabase
    .from("study_tasks")
    .select("id, session_id, plan_id, material_id, estimated_minutes, status")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: "Task not found." };

  const { error } = await supabase
    .from("study_tasks")
    .update({ status: done ? "completed" : "pending", completed_at: done ? new Date().toISOString() : null })
    .eq("id", taskId);
  if (error) return { ok: false, error: "Could not update this task." };

  let streak: number | undefined;
  let newAchievements: { name: string }[] = [];
  if (done && task.status !== "completed") {
    const { data: r } = await supabase.rpc("record_study_activity", {
      p_kind: "task_completed",
      p_minutes: task.estimated_minutes,
      p_material_id: task.material_id,
      p_reference_id: task.id,
    });
    const res = r as { current_streak?: number; new_achievements?: { name: string }[] } | null;
    streak = res?.current_streak;
    newAchievements = res?.new_achievements ?? [];
  }

  // Session status follows its tasks.
  const { data: siblings } = await supabase.from("study_tasks").select("status").eq("session_id", task.session_id);
  const statuses = (siblings ?? []).map((s) => s.status as string);
  const allDone = statuses.length > 0 && statuses.every((s) => s === "completed" || s === "skipped");
  const anyDone = statuses.some((s) => s === "completed");
  const { data: session } = await supabase.from("study_sessions").select("status").eq("id", task.session_id).single();
  let sessionCompleted = false;
  if (allDone && session?.status !== "completed") {
    await supabase.from("study_sessions").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", task.session_id);
    const { data: r } = await supabase.rpc("record_study_activity", { p_kind: "session_completed", p_reference_id: task.session_id });
    const res = r as { current_streak?: number; new_achievements?: { name: string }[] } | null;
    streak = res?.current_streak ?? streak;
    newAchievements = [...newAchievements, ...(res?.new_achievements ?? [])];
    sessionCompleted = true;
  } else if (!allDone && session && ["completed", "scheduled"].includes(session.status)) {
    await supabase
      .from("study_sessions")
      .update({ status: anyDone ? "in_progress" : "scheduled", completed_at: null })
      .eq("id", task.session_id);
  }
  await maybeCompletePlan(task.plan_id as string);

  revalidatePath("/planner", "layout");
  revalidatePath("/dashboard");
  return { ok: true, sessionCompleted, streak, newAchievements };
}

async function maybeCompletePlan(planId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("study_tasks")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", planId)
    .not("status", "in", "(completed,skipped)");
  if (count === 0) {
    await supabase.from("study_plans").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", planId).eq("status", "active");
  }
}

export async function setTaskSkipped(taskId: string, skipped: boolean): Promise<Result> {
  await requireUser();
  if (!uuid.safeParse(taskId).success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("study_tasks")
    .update({ status: skipped ? "skipped" : "pending" }, { count: "exact" })
    .eq("id", taskId)
    .neq("status", "completed");
  if (error || !count) return { ok: false, error: "Could not update this task." };
  revalidatePath("/planner", "layout");
  return { ok: true };
}

/* ------------------------------------------------------------------ editing */

export async function moveSession(sessionId: string, date: string): Promise<Result<{ warning?: string }>> {
  const user = await requireUser();
  const p = z.object({ sessionId: uuid, date: z.iso.date() }).safeParse({ sessionId, date });
  if (!p.success) return { ok: false, error: "Choose a valid date." };
  if (p.data.date < (await today(user.id))) return { ok: false, error: "Sessions can't be moved into the past." };
  const supabase = await createClient();
  const { data: s } = await supabase
    .from("study_sessions")
    .select("id, plan_id, status, study_plans(deadline)")
    .eq("id", p.data.sessionId)
    .maybeSingle();
  if (!s || !["scheduled", "in_progress"].includes(s.status as string)) return { ok: false, error: "Only upcoming sessions can be moved." };
  const { error } = await supabase.from("study_sessions").update({ scheduled_date: p.data.date }).eq("id", s.id);
  if (error) return { ok: false, error: "Could not move this session." };
  const plan = (Array.isArray(s.study_plans) ? s.study_plans[0] : s.study_plans) as { deadline: string } | null;
  revalidatePath("/planner", "layout");
  revalidatePath("/dashboard");
  return plan && p.data.date > plan.deadline
    ? { ok: true, warning: "Note: this session is now after your plan's deadline." }
    : { ok: true };
}

export async function setPlanStatus(planId: string, status: "active" | "archived"): Promise<Result> {
  await requireUser();
  if (!uuid.safeParse(planId).success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { error } = await supabase.from("study_plans").update({ status }).eq("id", planId);
  if (error) return { ok: false, error: "Could not update the plan." };
  revalidatePath("/planner", "layout");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deletePlan(planId: string): Promise<Result> {
  await requireUser();
  if (!uuid.safeParse(planId).success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { error } = await supabase.from("study_plans").delete().eq("id", planId);
  if (error) return { ok: false, error: "Could not delete the plan." };
  revalidatePath("/planner", "layout");
  revalidatePath("/dashboard");
  redirect("/planner?deleted=1");
}

/* ----------------------------------------------------------- adaptive reschedule */

async function buildProposal(userId: string, planId: string): Promise<{ proposal: RescheduleProposal; version: number } | null> {
  const plan = await getPlan(userId, planId);
  if (!plan || plan.status !== "active") return null;
  const open = plan.sessions.filter((s) => s.status === "scheduled" || s.status === "in_progress");
  const proposal = proposeReschedule({
    today: await today(userId),
    deadline: plan.deadline,
    dailyMinutes: plan.daily_minutes,
    studyDays: plan.study_days,
    workload: plan.workload,
    openSessions: open.map((s) => ({ id: s.id, date: s.scheduled_date, kind: s.kind, title: s.title, minutes: s.planned_minutes })),
    openTasks: open.flatMap((s) =>
      s.tasks
        .filter((t) => t.status !== "completed" && t.status !== "skipped")
        .map((t) => ({ id: t.id, title: t.title, minutes: t.estimated_minutes, sessionKind: s.kind, sessionId: s.id })),
    ),
  });
  return { proposal, version: plan.version };
}

export async function getRescheduleProposal(planId: string): Promise<Result<{ proposal: RescheduleProposal; version: number }>> {
  const user = await requireUser();
  if (!uuid.safeParse(planId).success) return { ok: false, error: "Invalid request." };
  const built = await buildProposal(user.id, planId);
  if (!built) return { ok: false, error: "Plan not found." };
  return { ok: true, ...built };
}

/** Applies the proposal the student reviewed. Refuses if the plan changed since. */
export async function applyReschedule(planId: string, version: number): Promise<Result<{ summary: string }>> {
  const user = await requireUser();
  if (!uuid.safeParse(planId).success) return { ok: false, error: "Invalid request." };
  const built = await buildProposal(user.id, planId);
  if (!built) return { ok: false, error: "Plan not found." };
  if (built.version !== version) return { ok: false, error: "Your plan changed since you reviewed it. Please review the new proposal." };
  const { proposal } = built;
  if (!proposal.needed) return { ok: false, error: "Your plan doesn't need rescheduling." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_plan_reschedule", {
    p_plan_id: planId,
    p: {
      today: await today(user.id),
      deadline: proposal.deadline,
      replace_session_ids: proposal.replaceSessionIds,
      sessions: proposal.sessions.map((s) => ({
        date: s.date,
        kind: s.kind,
        title: s.title,
        minutes: s.minutes,
        task_ids: s.taskIds,
        rescheduled_from: s.rescheduledFrom,
      })),
    },
  });
  if (error) return { ok: false, error: "We couldn't update your plan. Nothing was changed." };
  if (hasAdminClient()) {
    await createAdminClient().from("notifications").insert({
      user_id: user.id,
      kind: "plan_changed",
      title: "Study plan updated",
      body: proposal.summary.slice(0, 2000),
      link: `/planner/${planId}`,
    });
  }
  revalidatePath("/planner", "layout");
  revalidatePath("/dashboard");
  return { ok: true, summary: proposal.summary };
}
