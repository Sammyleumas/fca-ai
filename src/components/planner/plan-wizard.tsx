"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ArrowRight, CalendarDays, Check, Clock, Layers, ListChecks, Sparkles } from "lucide-react";
import { createPlan, previewPlan, type PlanInputForm, type PlanPreview } from "@/app/(app)/planner/actions";
import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState, FormMessage } from "@/components/ui/feedback";
import { FileBadge } from "@/components/ui/file-badge";
import { GlassCard } from "@/components/ui/glass-card";
import type { PlannableMaterial } from "@/lib/data/planner";
import { addDaysISO, relativeDayLabel } from "@/lib/utils/dates";
import { cn, formatMinutes } from "@/lib/utils/format";
import type { MaterialFileType } from "@/types/db";

const DAYS = [
  { v: 1, l: "Mon" },
  { v: 2, l: "Tue" },
  { v: 3, l: "Wed" },
  { v: 4, l: "Thu" },
  { v: 5, l: "Fri" },
  { v: 6, l: "Sat" },
  { v: 0, l: "Sun" },
];
const field = "glass h-12 w-full rounded-xl px-3 text-sm text-fg outline-none focus:border-accent/60 [&>option]:bg-bg-2";

export function PlanWizard({
  materials,
  preselected,
  today,
  defaultDailyMinutes,
}: {
  materials: PlannableMaterial[];
  preselected: string[];
  today: string;
  defaultDailyMinutes: number;
}) {
  const valid = preselected.filter((id) => materials.some((m) => m.id === id));
  const [mode, setMode] = useState<"individual" | "combined">(valid.length > 1 ? "combined" : "individual");
  const [selected, setSelected] = useState<string[]>(valid.length ? (valid.length > 1 ? valid : [valid[0]]) : []);
  const [form, setForm] = useState({
    title: "",
    startDate: today,
    deadline: addDaysISO(today, 13),
    dailyMinutes: defaultDailyMinutes,
    studyDays: [1, 2, 3, 4, 5],
    preferredTime: "" as "" | "morning" | "afternoon" | "evening" | "night" | "flexible",
    workload: "balanced" as "light" | "balanced" | "intensive",
  });
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [creating, startCreate] = useTransition();

  const input: PlanInputForm = useMemo(
    () => ({ ...form, preferredTime: form.preferredTime || null, materialIds: selected }),
    [form, selected],
  );
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setPreview(null);
  };

  const toggleMaterial = (id: string) => {
    setPreview(null);
    if (mode === "individual") setSelected([id]);
    else setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const runPreview = (override?: Partial<typeof form>) =>
    start(async () => {
      setError(undefined);
      const next: PlanInputForm = { ...input, ...override, preferredTime: (override?.preferredTime ?? form.preferredTime) || null };
      if (override) setForm((f) => ({ ...f, ...override }));
      const r = await previewPlan(next);
      if (!r.ok) {
        setError(r.error);
        setPreview(null);
      } else {
        setPreview(r.preview);
        if (window.matchMedia("(max-width: 1023px)").matches) {
          requestAnimationFrame(() => document.getElementById("plan-preview")?.scrollIntoView({ behavior: "smooth" }));
        }
      }
    });

  if (!materials.length) {
    return (
      <GlassCard>
        <EmptyState
          icon={<Layers className="size-6" />}
          title="No materials ready yet"
          description="Upload a learning material and wait for it to finish processing, then come back to build your plan."
          action={<Link href="/library?upload=1" className={buttonClasses({ size: "sm" })}>Upload material</Link>}
        />
      </GlassCard>
    );
  }

  const s = preview?.result.summary;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-5">
        <div role="tablist" aria-label="Plan type" className="grid grid-cols-2 gap-2">
          {(["individual", "combined"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setPreview(null);
                if (m === "individual") setSelected((x) => x.slice(0, 1));
              }}
              className={cn(
                "focus-ring h-12 rounded-full text-sm font-semibold transition",
                mode === m ? "bg-accent text-[#0b0c0b] shadow-[0_8px_24px_-10px_rgba(214,255,53,0.7)]" : "glass text-fg-2 hover:text-fg",
              )}
            >
              {m === "individual" ? "Individual" : "Combined"}
            </button>
          ))}
        </div>

        <GlassCard className="p-5">
          <h2 className="font-semibold">{mode === "individual" ? "Choose a material" : "Choose materials to study together"}</h2>
          <p className="mt-1 text-sm text-fg-2">
            {mode === "combined" ? "One coordinated timetable across all of them." : "A plan for one material."}
          </p>
          <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
            {materials.map((m) => {
              const on = selected.includes(m.id);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => toggleMaterial(m.id)}
                    aria-pressed={on}
                    className={cn(
                      "focus-ring flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition",
                      on ? "border-accent/60 bg-accent/10" : "border-line bg-white/[0.03] hover:border-line-strong",
                    )}
                  >
                    <FileBadge type={m.file_type as MaterialFileType} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{m.title}</span>
                      <span className="block text-xs text-fg-2">
                        {m.analysed ? `${m.unitCount} learning units` : m.unitCount ? `${m.unitCount} sections` : "Page ranges"}
                        {m.subject ? ` · ${m.subject}` : ""}
                      </span>
                    </span>
                    <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border", on ? "border-accent bg-accent text-[#0b0c0b]" : "border-line-strong")}>
                      {on && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </GlassCard>

        <GlassCard className="space-y-4 p-5">
          <h2 className="font-semibold">Your time</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="text-fg-2">Start</span>
              <input type="date" className={field} value={form.startDate} min={today} onChange={(e) => set("startDate", e.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-fg-2">Exam / completion deadline</span>
              <input type="date" className={field} value={form.deadline} min={form.startDate} onChange={(e) => set("deadline", e.target.value)} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Quick durations">
            {[7, 14, 28, 56].map((d) => (
              <button key={d} type="button" onClick={() => set("deadline", addDaysISO(form.startDate, d - 1))} className="focus-ring glass rounded-full px-3 py-1.5 text-xs text-fg-2 hover:text-fg">
                {d % 7 === 0 ? `${d / 7} week${d > 7 ? "s" : ""}` : `${d} days`}
              </button>
            ))}
          </div>
          <label className="block space-y-1.5 text-sm">
            <span className="flex justify-between text-fg-2">
              Study time per day <span className="font-semibold text-fg">{formatMinutes(form.dailyMinutes)}</span>
            </span>
            <input
              type="range"
              min={15}
              max={360}
              step={15}
              value={form.dailyMinutes}
              onChange={(e) => set("dailyMinutes", Number(e.target.value))}
              className="w-full accent-[#D6FF35]"
            />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm text-fg-2">Study days</legend>
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS.map((d) => {
                const on = form.studyDays.includes(d.v);
                return (
                  <button
                    key={d.v}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("studyDays", on ? form.studyDays.filter((x) => x !== d.v) : [...form.studyDays, d.v])}
                    className={cn("focus-ring h-10 rounded-xl text-xs font-semibold", on ? "bg-accent text-[#0b0c0b]" : "glass text-fg-2")}
                  >
                    {d.l}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="text-fg-2">Daily workload</span>
              <select className={field} value={form.workload} onChange={(e) => set("workload", e.target.value as typeof form.workload)}>
                <option value="light">Light (80% of your time)</option>
                <option value="balanced">Balanced</option>
                <option value="intensive">Intensive (up to 120%)</option>
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-fg-2">Preferred study time</span>
              <select className={field} value={form.preferredTime} onChange={(e) => set("preferredTime", e.target.value as typeof form.preferredTime)}>
                <option value="">No preference</option>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
                <option value="night">Night</option>
              </select>
            </label>
          </div>
          <label className="block space-y-1.5 text-sm">
            <span className="text-fg-2">Plan name (optional)</span>
            <input className={field} maxLength={200} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Final exams" />
          </label>
        </GlassCard>

        {error && <FormMessage>{error}</FormMessage>}
        <Button size="lg" className="w-full" onClick={() => runPreview()} loading={pending} disabled={!selected.length}>
          <Sparkles className="size-4" aria-hidden="true" /> Preview plan
        </Button>
      </div>

      <div id="plan-preview" className="min-w-0 scroll-mt-24 lg:sticky lg:top-24 lg:self-start">
        {!preview ? (
          <GlassCard>
            <EmptyState
              icon={<CalendarDays className="size-6" />}
              title="Your plan preview appears here"
              description="Choose materials and your available time, then preview. Nothing is saved until you create the plan."
            />
          </GlassCard>
        ) : (
          <GlassCard className="p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <span className="flex size-12 items-center justify-center rounded-2xl border border-accent/40 bg-accent/10 text-accent">
                <CalendarDays className="size-6" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-xl font-semibold">{s!.studyDays}-Day Study Plan</h2>
                <p className="text-sm text-fg-2">
                  {preview.materials.length > 1 ? `${preview.materials.length} materials combined` : preview.materials[0]?.title} · {s!.unitCount} units
                </p>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
              {[
                { icon: ListChecks, k: "Study days", v: s!.studyDays },
                { icon: Clock, k: "Total study", v: formatMinutes(s!.totalStudyMinutes) },
                { icon: Sparkles, k: "Revision days", v: s!.revisionDays },
              ].map(({ icon: Icon, k, v }) => (
                <div key={k} className="rounded-2xl border border-line bg-white/[0.03] p-3">
                  <Icon className="mx-auto size-4 text-accent" aria-hidden="true" />
                  <dd className="mt-1 font-semibold">{v}</dd>
                  <dt className="text-[11px] text-fg-2">{k}</dt>
                </div>
              ))}
            </dl>

            {!s!.feasible ? (
              <div className="mt-5 space-y-3">
                <FormMessage>
                  This plan needs about {formatMinutes(s!.requiredDailyMinutes)} a day to finish by the deadline. Choose an option:
                </FormMessage>
                <div className="flex flex-wrap gap-2">
                  {s!.requiredDailyMinutes <= 720 && (
                    <Button size="sm" variant="secondary" onClick={() => runPreview({ dailyMinutes: Math.min(720, Math.ceil(s!.requiredDailyMinutes / 15) * 15) })}>
                      Study {formatMinutes(Math.min(720, Math.ceil(s!.requiredDailyMinutes / 15) * 15))} a day
                    </Button>
                  )}
                  {s!.suggestedDeadline && (
                    <Button size="sm" variant="secondary" onClick={() => runPreview({ deadline: s!.suggestedDeadline! })}>
                      Move deadline to {s!.suggestedDeadline}
                    </Button>
                  )}
                  {form.studyDays.length < 7 && (
                    <Button size="sm" variant="secondary" onClick={() => runPreview({ studyDays: [0, 1, 2, 3, 4, 5, 6] })}>
                      Study every day
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <>
                {preview.result.warnings.map((w) => (
                  <FormMessage key={w} tone="info" className="mt-4">
                    {w}
                  </FormMessage>
                ))}
                <ol className="mt-5 max-h-[24rem] space-y-2 overflow-y-auto pr-1" aria-label="Sessions">
                  {preview.result.sessions
                    .filter((x) => x.kind !== "assessment")
                    .map((x, i) => (
                      <li key={`${x.date}-${x.kind}`} className="flex gap-3 rounded-2xl border border-line bg-white/[0.03] p-3">
                        <span className="w-14 shrink-0 text-xs font-semibold text-accent">Day {i + 1}<span className="block font-normal text-fg-2">{relativeDayLabel(x.date, today)}</span></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{x.title}</span>
                          <span className="block text-xs text-fg-2">
                            {x.tasks.length} {x.tasks.length === 1 ? "section" : "sections"} · {formatMinutes(x.minutes)}
                            {x.tasks[0] ? ` · p. ${x.tasks[0].startPage}–${x.tasks.at(-1)!.endPage}` : ""}
                          </span>
                        </span>
                      </li>
                    ))}
                </ol>
                <p className="mt-3 text-xs text-muted">Each study day also includes a short daily quiz.</p>
                <Button size="lg" className="mt-5 w-full" loading={creating} onClick={() => startCreate(async () => {
                  setError(undefined);
                  const r = await createPlan(input);
                  if (r && !r.ok) setError(r.error);
                })}>
                  Create plan <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </>
            )}
          </GlassCard>
        )}
      </div>
    </div>
  );
}
