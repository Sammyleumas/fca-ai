import { describe, expect, it } from "vitest";
import {
  availableDates,
  buildPlan,
  effectiveMinutes,
  interleave,
  pack,
  proposeReschedule,
  toWorkItems,
  type PlanMaterial,
  type Unit,
} from "@/lib/planner/scheduler";

const unit = (materialId: string, i: number, minutes = 30, complexity = 3): Unit => ({
  sectionId: `${materialId}-u${i}`,
  materialId,
  materialTitle: materialId.toUpperCase(),
  chapterTitle: `Chapter ${Math.floor(i / 3) + 1}`,
  title: `${materialId} unit ${i}`,
  startPage: i * 10 + 1,
  endPage: i * 10 + 10,
  minutes,
  complexity,
  objectives: [`Objective ${materialId}${i}`],
});
const material = (id: string, n: number, minutes = 30): PlanMaterial => ({ id, title: id.toUpperCase(), units: Array.from({ length: n }, (_, i) => unit(id, i, minutes)) });

describe("plan engine basics", () => {
  it("lists study days only", () => {
    // 2026-11-16 is a Monday.
    expect(availableDates("2026-11-16", "2026-11-22", [1, 3, 5])).toEqual(["2026-11-16", "2026-11-18", "2026-11-20"]);
  });

  it("weights time by complexity", () => {
    expect(effectiveMinutes({ minutes: 60, complexity: 5 })).toBe(78);
    expect(effectiveMinutes({ minutes: 60, complexity: 1 })).toBe(51);
    expect(effectiveMinutes({ minutes: 1, complexity: 1 })).toBe(5);
  });

  it("interleaves combined materials proportionally while keeping each material's order", () => {
    const order = interleave([material("a", 4), material("b", 2, 60)]).map((u) => u.sectionId);
    expect(order.filter((x) => x!.startsWith("a"))).toEqual(["a-u0", "a-u1", "a-u2", "a-u3"]);
    expect(order.filter((x) => x!.startsWith("b"))).toEqual(["b-u0", "b-u1"]);
    expect(order.slice(0, 3)).toEqual(["a-u0", "b-u0", "a-u1"]);
  });

  it("splits units larger than a day into page parts, never mid-page", () => {
    const items = toWorkItems([{ ...unit("a", 0, 150), startPage: 1, endPage: 9 }], 60);
    expect(items.map((i) => [i.startPage, i.endPage])).toEqual([[1, 3], [4, 6], [7, 9]]);
    expect(items[0].title).toBe("a unit 0 (part 1 of 3)");
  });

  it("packs evenly instead of front-loading", () => {
    const { buckets, overflow } = pack(Array.from({ length: 6 }, () => ({ minutes: 20 })), 3, 60);
    expect(buckets.map((b) => b.length)).toEqual([2, 2, 2]);
    expect(overflow).toEqual([]);
  });
});

describe("buildPlan", () => {
  it("creates a feasible individual plan with study, quiz and revision sessions in order", () => {
    const r = buildPlan({
      materials: [material("a", 12)],
      startDate: "2026-11-16",
      deadline: "2026-12-04",
      dailyMinutes: 60,
      studyDays: [1, 2, 3, 4, 5],
      workload: "balanced",
    });
    expect(r.summary.feasible).toBe(true);
    const study = r.sessions.filter((s) => s.kind === "study");
    const tasks = study.flatMap((s) => s.tasks.map((t) => t.sectionId));
    expect(tasks).toEqual(Array.from({ length: 12 }, (_, i) => `a-u${i}`)); // every unit exactly once, in order
    expect(study.every((s) => s.minutes <= r.summary.dailyCapacity)).toBe(true);
    expect(r.sessions.filter((s) => s.kind === "assessment").length).toBeGreaterThanOrEqual(study.length);
    const last = r.sessions.filter((s) => s.kind === "revision").at(-1)!;
    expect(last.title).toBe("Final revision");
    expect(last.date).toBe("2026-12-04");
    expect(r.sessions.every((s) => s.date >= "2026-11-16" && s.date <= "2026-12-04")).toBe(true);
    expect(study[0].objectives).toContain("Objective a0");
  });

  it("covers every unit of every material in a combined plan", () => {
    const r = buildPlan({
      materials: [material("a", 5), material("b", 5, 20), material("c", 3, 45)],
      startDate: "2026-11-16",
      deadline: "2026-11-30",
      dailyMinutes: 90,
      studyDays: [0, 1, 2, 3, 4, 5, 6],
      workload: "balanced",
    });
    expect(r.summary.feasible).toBe(true);
    const ids = r.sessions.filter((s) => s.kind === "study").flatMap((s) => s.tasks.map((t) => t.sectionId));
    expect(new Set(ids).size).toBe(13);
    // Each material's last unit lands in the second half of the plan (proportional progress).
    const lastIndex = (m: string) => ids.lastIndexOf(ids.filter((x) => x!.startsWith(m)).at(-1)!);
    for (const m of ["a", "b", "c"]) expect(lastIndex(m)).toBeGreaterThan(ids.length / 2);
  });

  it("reports infeasible plans with the required time and a deadline that would work", () => {
    const r = buildPlan({
      materials: [material("a", 20, 60)],
      startDate: "2026-11-16",
      deadline: "2026-11-20",
      dailyMinutes: 60,
      studyDays: [1, 2, 3, 4, 5],
      workload: "balanced",
    });
    expect(r.summary.feasible).toBe(false);
    expect(r.summary.requiredDailyMinutes).toBeGreaterThan(200);
    expect(r.summary.suggestedDeadline! > "2026-11-20").toBe(true);
    expect(r.warnings.join(" ")).toMatch(/don't fit/);
  });

  it("drops revision days before it lets study work overflow", () => {
    const r = buildPlan({
      materials: [material("a", 4, 50)],
      startDate: "2026-11-16",
      deadline: "2026-11-19",
      dailyMinutes: 60,
      studyDays: [1, 2, 3, 4],
      workload: "balanced",
    });
    expect(r.summary.feasible).toBe(true);
    expect(r.summary.revisionDays).toBe(0);
  });

  it("respects workload preference", () => {
    const args = { materials: [material("a", 10)], startDate: "2026-11-16", deadline: "2026-12-31", studyDays: [1, 2, 3, 4, 5], dailyMinutes: 60 };
    expect(buildPlan({ ...args, workload: "light" }).summary.dailyCapacity).toBe(38);
    expect(buildPlan({ ...args, workload: "intensive" }).summary.dailyCapacity).toBe(62);
  });
});

describe("proposeReschedule", () => {
  const open = (n: number, date: string) => ({ id: `s${n}`, date, kind: "study" as const, title: `Day ${n}`, minutes: 40 });
  const task = (n: number, s: number, minutes = 40) => ({ id: `t${n}`, title: `Task ${n}`, minutes, sessionKind: "study" as const, sessionId: `s${s}` });

  it("does nothing when no session was missed", () => {
    const p = proposeReschedule({
      today: "2026-11-18", deadline: "2026-11-30", dailyMinutes: 60, studyDays: [1, 2, 3, 4, 5], workload: "balanced",
      openSessions: [open(1, "2026-11-18")], openTasks: [task(1, 1)],
    });
    expect(p.needed).toBe(false);
    expect(p.sessions).toEqual([]);
  });

  it("re-plans unfinished work from today, keeping order and the deadline when possible", () => {
    const p = proposeReschedule({
      today: "2026-11-18", deadline: "2026-11-27", dailyMinutes: 60, studyDays: [1, 2, 3, 4, 5], workload: "balanced",
      openSessions: [open(1, "2026-11-16"), open(2, "2026-11-17"), open(3, "2026-11-18")],
      openTasks: [task(1, 1), task(2, 2), task(3, 3)],
    });
    expect(p.needed).toBe(true);
    expect(p.missedSessions).toBe(2);
    expect(p.deadlineExtended).toBe(false);
    expect(p.sessions.filter((s) => s.kind === "study").flatMap((s) => s.taskIds)).toEqual(["t1", "t2", "t3"]);
    expect(p.sessions.every((s) => s.date >= "2026-11-18" && s.date <= "2026-11-27")).toBe(true);
    expect(p.replaceSessionIds).toEqual(["s1", "s2", "s3"]);
    expect(p.summary).toMatch(/deadline is unchanged/);
  });

  it("proposes the earliest later deadline only when work no longer fits", () => {
    const p = proposeReschedule({
      today: "2026-11-26", deadline: "2026-11-27", dailyMinutes: 60, studyDays: [1, 2, 3, 4, 5], workload: "balanced",
      openSessions: [open(1, "2026-11-20")],
      openTasks: [task(1, 1, 50), task(2, 1, 50), task(3, 1, 50)],
    });
    expect(p.deadlineExtended).toBe(true);
    expect(p.deadline).toBe("2026-11-30");
    expect(p.feasible).toBe(true);
  });

  it("ignores past quiz-only sessions when deciding whether a reschedule is needed", () => {
    const p = proposeReschedule({
      today: "2026-11-18", deadline: "2026-11-30", dailyMinutes: 60, studyDays: [1, 2, 3, 4, 5], workload: "balanced",
      openSessions: [{ id: "q1", date: "2026-11-16", kind: "assessment", title: "Daily quiz", minutes: 10 }],
      openTasks: [],
    });
    expect(p.needed).toBe(false);
  });
});
