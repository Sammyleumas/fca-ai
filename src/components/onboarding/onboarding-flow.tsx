"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Plus, Sparkles, X } from "lucide-react";
import { completeOnboarding, type OnboardingState } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress";
import { EDUCATION_LEVELS, LEARNING_GOALS } from "@/lib/validation/profile";
import { cn } from "@/lib/utils/format";

type Data = {
  preferred_name: string;
  education_level: string | null;
  subjects: string[];
  learning_goals: string[];
  daily_study_minutes: number;
  preferred_study_time: "morning" | "afternoon" | "evening" | "night" | "flexible" | null;
  timezone: string;
  notification_prefs: {
    daily_reminder: boolean;
    reminder_time: string;
    sessions: boolean;
    quizzes: boolean;
    streaks: boolean;
    achievements: boolean;
    plan_changes: boolean;
    email: boolean;
  };
};

const STEPS = ["name", "level", "subjects", "goals", "time", "notifications", "done"] as const;
type Step = (typeof STEPS)[number];

const DURATIONS = [30, 45, 60, 90, 120, 180];
const TIMES = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
  { value: "flexible", label: "Flexible" },
] as const;

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "focus-ring min-h-12 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition",
        selected
          ? "border-accent/70 bg-accent/15 text-fg glow-accent"
          : "border-line bg-white/[0.04] text-fg-2 hover:border-line-strong hover:text-fg",
      )}
    >
      <span className="flex items-center justify-between gap-3">
        {children}
        {selected && <Check className="size-4 text-accent" aria-hidden="true" />}
      </span>
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-line bg-white/[0.03] px-4 py-3">
      <span>
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description && <span className="block text-xs text-fg-2">{description}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden="true"
        className="relative h-7 w-12 shrink-0 rounded-full bg-white/15 transition peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5 peer-checked:after:bg-[#000000]"
      />
    </label>
  );
}

export function OnboardingFlow({ initialName }: { initialName: string }) {
  const reduce = useReducedMotion();
  const [state, action, pending] = useActionState<OnboardingState, FormData>(completeOnboarding, {});
  const [stepIndex, setStepIndex] = useState(0);
  const [nameError, setNameError] = useState<string>();
  const [subjectDraft, setSubjectDraft] = useState("");
  const [data, setData] = useState<Data>({
    preferred_name: initialName,
    education_level: null,
    subjects: [],
    learning_goals: [],
    daily_study_minutes: 60,
    preferred_study_time: null,
    timezone: "UTC",
    notification_prefs: {
      daily_reminder: true,
      reminder_time: "18:00",
      sessions: true,
      quizzes: true,
      streaks: true,
      achievements: true,
      plan_changes: true,
      email: false,
    },
  });

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only value, read once after mount
    if (tz) setData((d) => ({ ...d, timezone: tz }));
  }, []);

  const step: Step = STEPS[stepIndex];
  const progress = useMemo(() => Math.round((stepIndex / (STEPS.length - 1)) * 100), [stepIndex]);
  const set = <K extends keyof Data>(key: K, value: Data[K]) => setData((d) => ({ ...d, [key]: value }));

  const next = () => {
    if (step === "name") {
      const n = data.preferred_name.trim();
      if (!n) return setNameError("Tell us what to call you.");
      if (n.length > 60) return setNameError("Keep it under 60 characters.");
      setNameError(undefined);
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };
  const back = () => setStepIndex((i) => Math.max(i - 1, 0));
  const skip = () => setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));

  const addSubject = () => {
    const s = subjectDraft.trim();
    if (!s || data.subjects.some((x) => x.toLowerCase() === s.toLowerCase()) || data.subjects.length >= 20) return;
    set("subjects", [...data.subjects, s.slice(0, 120)]);
    setSubjectDraft("");
  };

  const toggleGoal = (g: string) =>
    set("learning_goals", data.learning_goals.includes(g) ? data.learning_goals.filter((x) => x !== g) : [...data.learning_goals, g]);

  const skippable = step !== "name" && step !== "done";

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between text-xs text-fg-2">
          <span>
            Step {Math.min(stepIndex + 1, STEPS.length - 1)} of {STEPS.length - 1}
          </span>
          {skippable && (
            <button type="button" onClick={skip} className="focus-ring rounded px-1 font-medium text-fg-2 hover:text-fg">
              Skip
            </button>
          )}
        </div>
        <ProgressBar value={progress} label="Onboarding progress" />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.section
          key={step}
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -12 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="flex-1"
          aria-live="polite"
        >
          {step === "name" && (
            <div className="space-y-6">
              <Header title="What should we call you?" text="We'll use this to personalise your study space." />
              <TextField
                label="Preferred name"
                value={data.preferred_name}
                onChange={(e) => set("preferred_name", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), next())}
                error={nameError}
                autoFocus
                maxLength={60}
                autoComplete="given-name"
              />
            </div>
          )}

          {step === "level" && (
            <div className="space-y-6">
              <Header title="Where are you in your studies?" text="This helps FCA-AI pitch explanations at the right level." />
              <div className="grid gap-2.5 sm:grid-cols-2">
                {EDUCATION_LEVELS.map((l) => (
                  <Chip
                    key={l.value}
                    selected={data.education_level === l.value}
                    onClick={() => set("education_level", data.education_level === l.value ? null : l.value)}
                  >
                    {l.label}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {step === "subjects" && (
            <div className="space-y-6">
              <Header title="What are you studying?" text="Add subjects, courses or exams. You can organise materials by these later." />
              <div className="flex gap-2">
                <TextField
                  label="Subject or course"
                  hideLabel
                  placeholder="e.g. Computer Networks"
                  value={subjectDraft}
                  onChange={(e) => setSubjectDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSubject())}
                  className="flex-1"
                  maxLength={120}
                />
                <Button type="button" variant="secondary" className="h-14 w-14 shrink-0 px-0" onClick={addSubject} aria-label="Add subject">
                  <Plus className="size-5" />
                </Button>
              </div>
              {data.subjects.length > 0 ? (
                <ul className="flex flex-wrap gap-2" aria-label="Your subjects">
                  {data.subjects.map((s) => (
                    <li key={s} className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 py-1.5 pl-3.5 pr-1.5 text-sm">
                      {s}
                      <button
                        type="button"
                        className="focus-ring rounded-full p-1 text-fg-2 hover:text-fg"
                        aria-label={`Remove ${s}`}
                        onClick={() => set("subjects", data.subjects.filter((x) => x !== s))}
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No subjects yet — add one above or skip for now.</p>
              )}
            </div>
          )}

          {step === "goals" && (
            <div className="space-y-6">
              <Header title="What are your learning goals?" text="Pick as many as you like." />
              <div className="grid gap-2.5 sm:grid-cols-2">
                {LEARNING_GOALS.map((g) => (
                  <Chip key={g} selected={data.learning_goals.includes(g)} onClick={() => toggleGoal(g)}>
                    {g}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {step === "time" && (
            <div className="space-y-8">
              <Header title="How long can you study each day?" text="Plans will respect this — realistic beats ambitious." />
              <fieldset>
                <legend className="mb-3 text-sm font-medium text-fg-2">Daily study time</legend>
                <div className="grid grid-cols-3 gap-2.5">
                  {DURATIONS.map((m) => (
                    <Chip key={m} selected={data.daily_study_minutes === m} onClick={() => set("daily_study_minutes", m)}>
                      {m < 60 ? `${m} min` : `${m / 60} hr${m > 60 ? "s" : ""}`}
                    </Chip>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-3 text-sm font-medium text-fg-2">Preferred study time</legend>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {TIMES.map((t) => (
                    <Chip
                      key={t.value}
                      selected={data.preferred_study_time === t.value}
                      onClick={() => set("preferred_study_time", data.preferred_study_time === t.value ? null : t.value)}
                    >
                      {t.label}
                    </Chip>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {step === "notifications" && (
            <div className="space-y-6">
              <Header title="Stay on track" text={`Reminders use your time zone (${data.timezone}). Change these any time in Settings.`} />
              <div className="space-y-2.5">
                <Toggle
                  label="Daily study reminder"
                  checked={data.notification_prefs.daily_reminder}
                  onChange={(v) => set("notification_prefs", { ...data.notification_prefs, daily_reminder: v })}
                />
                {data.notification_prefs.daily_reminder && (
                  <TextField
                    label="Reminder time"
                    type="time"
                    value={data.notification_prefs.reminder_time}
                    onChange={(e) => set("notification_prefs", { ...data.notification_prefs, reminder_time: e.target.value || "18:00" })}
                  />
                )}
                <Toggle
                  label="Upcoming sessions & unfinished tasks"
                  checked={data.notification_prefs.sessions}
                  onChange={(v) => set("notification_prefs", { ...data.notification_prefs, sessions: v })}
                />
                <Toggle
                  label="Quiz reminders"
                  checked={data.notification_prefs.quizzes}
                  onChange={(v) => set("notification_prefs", { ...data.notification_prefs, quizzes: v })}
                />
                <Toggle
                  label="Streaks & achievements"
                  checked={data.notification_prefs.streaks}
                  onChange={(v) =>
                    set("notification_prefs", { ...data.notification_prefs, streaks: v, achievements: v })
                  }
                />
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="flex flex-col items-start space-y-6">
              <span className="flex size-14 items-center justify-center rounded-2xl border border-accent/40 bg-accent/10 text-accent glow-accent">
                <Sparkles className="size-7" aria-hidden="true" />
              </span>
              <Header
                title={`You're all set, ${data.preferred_name.trim() || "friend"}!`}
                text="Next, upload your learning materials and FCA-AI will help you turn them into a plan."
              />
              <FormMessage>{state.error}</FormMessage>
            </div>
          )}
        </motion.section>
      </AnimatePresence>

      <div className="sticky bottom-0 mt-10 flex items-center gap-3 bg-gradient-to-t from-bg via-bg/90 to-transparent pb-4 pt-6">
        {stepIndex > 0 && (
          <Button type="button" variant="secondary" size="lg" onClick={back} className="w-14 px-0" aria-label="Previous step">
            <ArrowLeft className="size-5" />
          </Button>
        )}
        {step === "done" ? (
          <form action={action} className="flex-1">
            <input type="hidden" name="payload" value={JSON.stringify(data)} />
            <Button type="submit" size="lg" className="w-full" loading={pending}>
              Go to my dashboard {!pending && <ArrowRight className="size-4" aria-hidden="true" />}
            </Button>
          </form>
        ) : (
          <Button type="button" size="lg" className="flex-1" onClick={next}>
            Continue <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

function Header({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-fg-2">{text}</p>
    </div>
  );
}
