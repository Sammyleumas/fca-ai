/**
 * MindFlow study-plan engine (pure, deterministic, unit-tested).
 *
 * It schedules AI-analysed learning units — never raw page ranges — across the
 * student's available days, considering complexity, length, order, daily time,
 * study days and workload. Combined plans interleave materials so every material
 * progresses proportionally and all finish before the deadline.
 */
import { addDaysISO } from "@/lib/utils/dates";

export type Workload = "light" | "balanced" | "intensive";

export type Unit = {
  sectionId: string | null;
  materialId: string;
  materialTitle: string;
  chapterTitle: string | null;
  title: string;
  startPage: number;
  endPage: number;
  minutes: number;
  complexity: number | null; // 1..5
  objectives: string[];
};

export type PlanMaterial = { id: string; title: string; units: Unit[] };

export type PlanInput = {
  materials: PlanMaterial[];
  startDate: string; // yyyy-mm-dd (student's zone)
  deadline: string; // inclusive
  dailyMinutes: number;
  studyDays: number[]; // 0=Sun … 6=Sat
  workload: Workload;
  includeRevision?: boolean;
  includeAssessments?: boolean;
};

export type PlannedTask = {
  materialId: string;
  sectionId: string | null;
  title: string;
  startPage: number;
  endPage: number;
  minutes: number;
};

export type PlannedSession = {
  date: string;
  kind: "study" | "revision" | "assessment";
  title: string;
  minutes: number;
  objectives: string[];
  tasks: PlannedTask[];
};

export type PlanSummary = {
  feasible: boolean;
  availableDays: number;
  studyDays: number;
  revisionDays: number;
  totalStudyMinutes: number;
  capacityMinutes: number;
  dailyCapacity: number;
  requiredDailyMinutes: number;
  /** Earliest deadline that would fit at the current daily time (when infeasible). */
  suggestedDeadline: string | null;
  unitCount: number;
  lastStudyDate: string | null;
};

export type PlanResult = { sessions: PlannedSession[]; summary: PlanSummary; warnings: string[] };

export const WORKLOAD_FACTOR: Record<Workload, number> = { light: 0.8, balanced: 1, intensive: 1.2 };
const COMPLEXITY_FACTOR = [1, 0.85, 0.95, 1, 1.15, 1.3];
export const DAILY_QUIZ_MINUTES = 10;
const MIN_TASK_MINUTES = 5;

export function weekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function availableDates(start: string, deadline: string, studyDays: number[]): string[] {
  const out: string[] = [];
  const days = new Set(studyDays);
  for (let d = start; d <= deadline && out.length < 1000; d = addDaysISO(d, 1)) if (days.has(weekday(d))) out.push(d);
  return out;
}

export function effectiveMinutes(u: Pick<Unit, "minutes" | "complexity">): number {
  const f = COMPLEXITY_FACTOR[Math.min(5, Math.max(0, Math.round(u.complexity ?? 3)))] ?? 1;
  return Math.max(MIN_TASK_MINUTES, Math.round(u.minutes * f));
}

/**
 * Combined plans: repeatedly take the next unit from the material that is
 * furthest behind (by share of its own total minutes), keeping each material's
 * internal order. Individual plans keep document order.
 */
export function interleave(materials: PlanMaterial[]): Unit[] {
  if (materials.length <= 1) return materials[0]?.units.slice() ?? [];
  const totals = materials.map((m) => m.units.reduce((n, u) => n + effectiveMinutes(u), 0) || 1);
  const done = materials.map(() => 0);
  const idx = materials.map(() => 0);
  const out: Unit[] = [];
  for (;;) {
    let best = -1;
    let bestShare = Infinity;
    materials.forEach((m, i) => {
      if (idx[i] >= m.units.length) return;
      const share = done[i] / totals[i];
      if (share < bestShare - 1e-9) {
        bestShare = share;
        best = i;
      }
    });
    if (best < 0) return out;
    const u = materials[best].units[idx[best]++];
    done[best] += effectiveMinutes(u);
    out.push(u);
  }
}

type WorkItem = PlannedTask & { objectives: string[]; chapterTitle: string | null; materialTitle: string; complexity: number | null };

/** Units longer than a day's capacity are split by pages into parts (never mid-page). */
export function toWorkItems(units: Unit[], capacity: number): WorkItem[] {
  const items: WorkItem[] = [];
  for (const u of units) {
    const minutes = effectiveMinutes(u);
    const pages = u.endPage - u.startPage + 1;
    const parts = Math.min(pages, Math.ceil(minutes / capacity));
    if (parts <= 1) {
      items.push({ ...base(u), minutes });
      continue;
    }
    for (let p = 0; p < parts; p++) {
      const s = u.startPage + Math.floor((p * pages) / parts);
      const e = u.startPage + Math.floor(((p + 1) * pages) / parts) - 1;
      items.push({ ...base(u), title: `${u.title} (part ${p + 1} of ${parts})`, startPage: s, endPage: Math.max(s, e), minutes: Math.round(minutes / parts) });
    }
  }
  return items;
}

function base(u: Unit): Omit<WorkItem, "minutes"> {
  return {
    materialId: u.materialId,
    sectionId: u.sectionId,
    title: u.title,
    startPage: u.startPage,
    endPage: u.endPage,
    objectives: u.objectives,
    chapterTitle: u.chapterTitle,
    materialTitle: u.materialTitle,
    complexity: u.complexity,
  };
}

/**
 * Packs ordered items into days. Each day aims for an even share of the remaining
 * work (so the plan doesn't front-load and leave the last week empty), never exceeds
 * capacity unless a single item is larger than a whole day.
 */
export function pack<T extends { minutes: number }>(items: T[], days: number, capacity: number): { buckets: T[][]; overflow: T[] } {
  const buckets: T[][] = [];
  let i = 0;
  for (let d = 0; d < days && i < items.length; d++) {
    const remaining = items.slice(i).reduce((n, x) => n + x.minutes, 0);
    const target = Math.min(capacity, Math.ceil(remaining / (days - d)));
    const bucket: T[] = [];
    let load = 0;
    while (i < items.length) {
      const m = items[i].minutes;
      const fitsTarget = load + m <= target + Math.min(15, target * 0.2);
      if (bucket.length && (!fitsTarget || load + m > capacity)) break;
      bucket.push(items[i++]);
      load += m;
      if (load >= target) break;
    }
    buckets.push(bucket);
  }
  return { buckets, overflow: items.slice(i) };
}

function revisionSlots(available: number, enabled: boolean): number[] {
  if (!enabled || available < 4) return [];
  const slots = new Set<number>();
  for (let k = 6; k < available - 1; k += 7) slots.add(k); // a weekly review after 6 study days
  slots.add(available - 1); // final review before the deadline
  return [...slots].sort((a, b) => a - b);
}

function sessionTitle(items: WorkItem[], combined: boolean): string {
  const chapters = [...new Set(items.map((i) => (combined ? i.materialTitle : (i.chapterTitle ?? i.materialTitle))))];
  const head = chapters.slice(0, 2).join(" · ");
  return `Study: ${head}${chapters.length > 2 ? ` +${chapters.length - 2}` : ""}`.slice(0, 200);
}

function objectivesFor(items: WorkItem[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    const o = it.objectives.length ? it.objectives.slice(0, 2) : [`Understand ${it.title.replace(/ \(part \d+ of \d+\)$/, "")}`];
    for (const x of o) if (!out.includes(x)) out.push(x);
  }
  return out.slice(0, 6);
}

export function buildPlan(input: PlanInput): PlanResult {
  const warnings: string[] = [];
  const includeRevision = input.includeRevision ?? true;
  const includeAssessments = input.includeAssessments ?? true;
  const dates = availableDates(input.startDate, input.deadline, input.studyDays);
  const quiz = includeAssessments ? DAILY_QUIZ_MINUTES : 0;
  const dailyCapacity = Math.max(10, Math.round(input.dailyMinutes * WORKLOAD_FACTOR[input.workload]) - quiz);
  const combined = input.materials.length > 1;

  const ordered = interleave(input.materials);
  const items = toWorkItems(ordered, dailyCapacity);
  const total = items.reduce((n, x) => n + x.minutes, 0);

  // Use revision days only while the study work still fits.
  let revision = revisionSlots(dates.length, includeRevision);
  while (revision.length && total > (dates.length - revision.length) * dailyCapacity) revision = revision.slice(0, -1);
  const revisionSet = new Set(revision);
  const studyDates = dates.filter((_, i) => !revisionSet.has(i));
  const capacityMinutes = studyDates.length * dailyCapacity;
  const feasible = dates.length > 0 && items.length > 0 && total <= capacityMinutes;

  const required = dates.length ? Math.ceil((total / dates.length + quiz) / WORKLOAD_FACTOR[input.workload]) : total;
  let suggestedDeadline: string | null = null;
  if (!feasible && items.length && input.studyDays.length) {
    let d = input.deadline;
    for (let guard = 0; guard < 730; guard++) {
      d = addDaysISO(d, 1);
      if (availableDates(input.startDate, d, input.studyDays).length * dailyCapacity >= total) {
        suggestedDeadline = d;
        break;
      }
    }
  }
  if (!dates.length) warnings.push("There are no study days between the start date and the deadline.");
  if (!items.length) warnings.push("The selected materials have no study sections yet.");

  const { buckets, overflow } = pack(items, studyDates.length, dailyCapacity);
  if (overflow.length) {
    warnings.push(
      `${overflow.length} section${overflow.length === 1 ? "" : "s"} don't fit before the deadline at ${input.dailyMinutes} minutes a day.`,
    );
  }

  const sessions: PlannedSession[] = [];
  const studiedSinceReview: WorkItem[] = [];
  const allStudied: WorkItem[] = [];
  let b = 0;
  dates.forEach((date, i) => {
    if (revisionSet.has(i)) {
      const final = i === dates.length - 1;
      const pool = final ? allStudied : studiedSinceReview;
      if (!pool.length) return;
      // Review the hardest material first, within the day's time.
      const ranked = [...pool].sort((a, c) => (c.complexity ?? 3) - (a.complexity ?? 3));
      const tasks: PlannedTask[] = [];
      let load = 0;
      for (const it of ranked) {
        const m = Math.max(MIN_TASK_MINUTES, Math.round(it.minutes * 0.3));
        if (load + m > dailyCapacity) continue;
        tasks.push({ materialId: it.materialId, sectionId: it.sectionId, title: `Review: ${it.title}`, startPage: it.startPage, endPage: it.endPage, minutes: m });
        load += m;
      }
      tasks.sort((a, c) => (a.materialId === c.materialId ? a.startPage - c.startPage : 0));
      sessions.push({
        date,
        kind: "revision",
        title: final ? "Final revision" : "Weekly revision",
        minutes: Math.max(load, MIN_TASK_MINUTES),
        objectives: ["Revisit the most challenging sections", "Check what you still find difficult"],
        tasks,
      });
      studiedSinceReview.length = 0;
      if (includeAssessments) sessions.push(assessment(date, final ? "Mock assessment" : "Weekly quiz", 20));
      return;
    }
    const bucket = buckets[b++] ?? [];
    if (!bucket.length) return;
    studiedSinceReview.push(...bucket);
    allStudied.push(...bucket);
    sessions.push({
      date,
      kind: "study",
      title: sessionTitle(bucket, combined),
      minutes: bucket.reduce((n, x) => n + x.minutes, 0),
      objectives: objectivesFor(bucket),
      tasks: bucket.map(({ materialId, sectionId, title, startPage, endPage, minutes }) => ({ materialId, sectionId, title, startPage, endPage, minutes })),
    });
    if (includeAssessments) sessions.push(assessment(date, "Daily quiz", DAILY_QUIZ_MINUTES));
  });

  const studySessions = sessions.filter((s) => s.kind === "study");
  return {
    sessions,
    warnings,
    summary: {
      feasible,
      availableDays: dates.length,
      studyDays: studySessions.length,
      revisionDays: sessions.filter((s) => s.kind === "revision").length,
      totalStudyMinutes: total,
      capacityMinutes,
      dailyCapacity,
      requiredDailyMinutes: required,
      suggestedDeadline,
      unitCount: ordered.length,
      lastStudyDate: studySessions.at(-1)?.date ?? null,
    },
  };
}

function assessment(date: string, title: string, minutes: number): PlannedSession {
  return { date, kind: "assessment", title, minutes, objectives: ["Check your understanding of today's topics"], tasks: [] };
}

/* ------------------------------------------------------------------ reschedule */

export type OpenTask = { id: string; title: string; minutes: number; sessionKind: "study" | "revision" | "assessment"; sessionId: string };
export type OpenSession = { id: string; date: string; kind: "study" | "revision" | "assessment"; title: string; minutes: number };

export type RescheduleInput = {
  today: string;
  deadline: string;
  dailyMinutes: number;
  studyDays: number[];
  workload: Workload;
  includeAssessments?: boolean;
  /** Unfinished sessions (missed or upcoming), oldest first. */
  openSessions: OpenSession[];
  /** Unfinished tasks of those sessions, in their original order. */
  openTasks: OpenTask[];
};

export type ProposedSession = {
  date: string;
  kind: "study" | "revision" | "assessment";
  title: string;
  minutes: number;
  taskIds: string[];
  rescheduledFrom: string | null;
};

export type RescheduleProposal = {
  needed: boolean;
  missedSessions: number;
  feasible: boolean;
  deadline: string;
  deadlineExtended: boolean;
  replaceSessionIds: string[];
  sessions: ProposedSession[];
  summary: string;
};

/**
 * Re-plans every unfinished task from today onwards, keeping order and realistic
 * daily loads. Prefers the existing deadline; only if the work can't fit does it
 * propose the earliest later deadline. Returns a proposal — nothing is applied
 * until the student approves it.
 */
export function proposeReschedule(input: RescheduleInput): RescheduleProposal {
  // Quiz-only sessions don't count as missed study; they are regenerated with the new days.
  const missed = input.openSessions.filter((s) => s.date < input.today && s.kind !== "assessment");
  const base: RescheduleProposal = {
    needed: missed.length > 0,
    missedSessions: missed.length,
    feasible: true,
    deadline: input.deadline,
    deadlineExtended: false,
    replaceSessionIds: [],
    sessions: [],
    summary: "Your plan is on track.",
  };
  if (!missed.length) return base;

  const includeAssessments = input.includeAssessments ?? true;
  const quiz = includeAssessments ? DAILY_QUIZ_MINUTES : 0;
  const capacity = Math.max(10, Math.round(input.dailyMinutes * WORKLOAD_FACTOR[input.workload]) - quiz);
  const items = input.openTasks.filter((t) => t.sessionKind !== "assessment");
  const total = items.reduce((n, t) => n + t.minutes, 0);

  let deadline = input.deadline < input.today ? input.today : input.deadline;
  let dates = availableDates(input.today, deadline, input.studyDays);
  let extended = false;
  for (let guard = 0; dates.length * capacity < total && guard < 365; guard++) {
    deadline = addDaysISO(deadline, 1);
    dates = availableDates(input.today, deadline, input.studyDays);
    extended = true;
  }
  const feasible = dates.length * capacity >= total;

  const { buckets } = pack(items, dates.length, capacity);
  const originalSession = new Map(input.openTasks.map((t) => [t.id, t.sessionId]));
  const sessions: ProposedSession[] = [];
  buckets.forEach((bucket, i) => {
    if (!bucket.length) return;
    const date = dates[i];
    const kind = bucket.every((t) => t.sessionKind === "revision") ? "revision" : "study";
    sessions.push({
      date,
      kind,
      title: kind === "revision" ? "Revision" : bucket.length === 1 ? `Study: ${bucket[0].title}` : `Study: ${bucket[0].title} +${bucket.length - 1}`,
      minutes: bucket.reduce((n, t) => n + t.minutes, 0),
      taskIds: bucket.map((t) => t.id),
      rescheduledFrom: originalSession.get(bucket[0].id) ?? null,
    });
    if (includeAssessments) sessions.push({ date, kind: "assessment", title: "Daily quiz", minutes: quiz, taskIds: [], rescheduledFrom: null });
  });

  const span = sessions.length ? `${sessions[0].date} to ${sessions.at(-1)!.date}` : "";
  return {
    needed: true,
    missedSessions: missed.length,
    feasible,
    deadline,
    deadlineExtended: extended,
    replaceSessionIds: input.openSessions.map((s) => s.id),
    sessions,
    summary: `${missed.length} missed session${missed.length === 1 ? "" : "s"}. ${items.length} unfinished task${items.length === 1 ? "" : "s"} (${total} min) rearranged across ${sessions.filter((s) => s.kind !== "assessment").length} sessions${span ? `, ${span}` : ""}.${extended ? ` The deadline would move to ${deadline} because the remaining work no longer fits.` : " Your deadline is unchanged."}`,
  };
}
