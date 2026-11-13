"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ClipboardCheck, Loader2, Play, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { deleteQuiz, startAttempt } from "@/app/(app)/assessments/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/feedback";
import { GlassCard } from "@/components/ui/glass-card";
import { QUESTION_TYPES, TYPE_LABEL, type QuestionType } from "@/lib/assessments/questions";
import { cn } from "@/lib/utils/format";

async function requestQuiz(body: unknown): Promise<{ quizId?: string; error?: string }> {
  const res = await fetch("/api/quizzes/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await res.json().catch(() => ({ error: "The quiz generator is unavailable right now." }))) as { quizId?: string; error?: string };
}

function Generating() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/75 px-6 text-center backdrop-blur-sm" role="status">
      <Loader2 className="size-8 animate-spin text-accent" aria-hidden="true" />
      <p className="font-semibold">Writing questions from your material…</p>
      <p className="max-w-sm text-sm text-fg-2">Every question is checked against the pages it comes from. This can take up to a minute.</p>
    </div>
  );
}

export type QuizSourceMaterial = { id: string; title: string; chapters: { id: string; title: string }[] };

export function NewQuizForm({ materials, plans, defaultMock }: { materials: QuizSourceMaterial[]; plans: { id: string; title: string }[]; defaultMock: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<"practice" | "mock">(defaultMock ? "mock" : "practice");
  const [source, setSource] = useState<string>(materials[0] ? `m:${materials[0].id}` : plans[0] ? `p:${plans[0].id}` : "");
  const [chapters, setChapters] = useState<string[]>([]);
  const [count, setCount] = useState(defaultMock ? 20 : 10);
  const [types, setTypes] = useState<QuestionType[]>(defaultMock ? [...QUESTION_TYPES] : ["mcq", "true_false", "fill_blank", "short_answer"]);
  const [timed, setTimed] = useState(defaultMock);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const material = source.startsWith("m:") ? materials.find((m) => `m:${m.id}` === source) : undefined;

  if (!materials.length) {
    return <p className="text-sm text-fg-2">Quizzes are built from your materials. Upload one and wait until it&apos;s ready.</p>;
  }

  const go = () =>
    start(async () => {
      setError(undefined);
      const body = source.startsWith("p:")
        ? { source: "plan", planId: source.slice(2), count, types, timed }
        : { source: "material", materialId: source.slice(2), sectionIds: chapters.length ? chapters : undefined, kind, count, types, timed };
      const r = await requestQuiz(body);
      if (r.quizId && !r.error) router.push(`/assessments/${r.quizId}`);
      else setError(r.error ?? "Something went wrong.");
    });

  const field = "glass h-12 w-full rounded-xl px-3 text-sm text-fg outline-none [&>option]:bg-bg-2";
  return (
    <div className="space-y-4">
      {pending && <Generating />}
      <div role="tablist" className="grid grid-cols-2 gap-2">
        {(["practice", "mock"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={kind === k}
            onClick={() => {
              setKind(k);
              setCount(k === "mock" ? 20 : 10);
              setTimed(k === "mock");
              if (k === "mock") setTypes([...QUESTION_TYPES]);
            }}
            className={cn("focus-ring flex h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold", kind === k ? "bg-accent text-[#000000]" : "glass text-fg-2")}
          >
            {k === "practice" ? <ClipboardCheck className="size-4" aria-hidden="true" /> : <Trophy className="size-4" aria-hidden="true" />}
            {k === "practice" ? "Practice quiz" : "Mock exam"}
          </button>
        ))}
      </div>
      <label className="block space-y-1.5 text-sm">
        <span className="text-fg-2">From</span>
        <select className={field} value={source} onChange={(e) => { setSource(e.target.value); setChapters([]); }}>
          <optgroup label="Materials">
            {materials.map((m) => <option key={m.id} value={`m:${m.id}`}>{m.title}</option>)}
          </optgroup>
          {kind === "mock" && plans.length > 0 && (
            <optgroup label="Study plans (what you've studied)">
              {plans.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.title}</option>)}
            </optgroup>
          )}
        </select>
      </label>
      {material && material.chapters.length > 1 && (
        <fieldset>
          <legend className="mb-2 text-sm text-fg-2">Chapters (optional — all if none selected)</legend>
          <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
            {material.chapters.map((c) => {
              const on = chapters.includes(c.id);
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => setChapters((x) => (on ? x.filter((y) => y !== c.id) : [...x, c.id]))} className={cn("focus-ring rounded-full border px-3 py-1.5 text-xs", on ? "border-accent bg-accent/15 text-fg" : "border-line text-fg-2")}>
                  {c.title}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm">
          <span className="text-fg-2">Questions</span>
          <select className={field} value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[5, 10, 15, 20, 30, 40].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 text-sm sm:mt-6">
          <span className="text-fg-2">Timed</span>
          <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} className="size-5 accent-[#FFEB3B]" />
        </label>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm text-fg-2">Question types</legend>
        <div className="flex flex-wrap gap-1.5">
          {QUESTION_TYPES.map((t) => {
            const on = types.includes(t);
            return (
              <button key={t} type="button" aria-pressed={on} onClick={() => setTypes((x) => (on ? (x.length > 1 ? x.filter((y) => y !== t) : x) : [...x, t]))} className={cn("focus-ring rounded-full border px-3 py-1.5 text-xs", on ? "border-accent bg-accent/15 text-fg" : "border-line text-fg-2")}>
                {TYPE_LABEL[t]}
              </button>
            );
          })}
        </div>
      </fieldset>
      {error && <FormMessage>{error}</FormMessage>}
      <Button size="lg" className="w-full" onClick={go} loading={pending} disabled={!source}>
        <Sparkles className="size-4" aria-hidden="true" /> Generate {kind === "mock" ? "mock exam" : "quiz"}
      </Button>
    </div>
  );
}

export function StartQuizButton({ quizId, label, resume }: { quizId: string; label: string; resume?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button
        size="lg"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await startAttempt(quizId);
            if (!r.ok) setError(r.error);
            else router.push(`/assessments/${quizId}/take?attempt=${r.attemptId}`);
          })
        }
      >
        {resume ? <Play className="size-4" aria-hidden="true" /> : <RotateCcw className="size-4" aria-hidden="true" />} {label}
      </Button>
      {error && <FormMessage>{error}</FormMessage>}
    </div>
  );
}

export function DailyQuizButton({ sessionId, label = "Start daily quiz" }: { sessionId: string; label?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <GlassCard className="space-y-3 p-5">
      {pending && <Generating />}
      <p className="text-sm text-fg-2">A short quiz on exactly the sections assigned for this day, with explanations and source pages.</p>
      <Button
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(undefined);
            const r = await requestQuiz({ source: "session", sessionId });
            if (r.quizId && !r.error) router.push(`/assessments/${r.quizId}`);
            else setError(r.error ?? "Something went wrong.");
          })
        }
      >
        <ClipboardCheck className="size-4" aria-hidden="true" /> {label}
      </Button>
      {error && <FormMessage>{error}</FormMessage>}
    </GlassCard>
  );
}

export function DeleteQuizButton({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" loading={pending} onClick={() => start(async () => { const r = await deleteQuiz(quizId); if (r.ok) router.push("/assessments"); })}>
      Delete quiz
    </Button>
  );
}
