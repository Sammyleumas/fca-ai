"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, Clock, Flag, Loader2 } from "lucide-react";
import { submitAttempt } from "@/app/(app)/assessments/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/feedback";
import { GlassCard } from "@/components/ui/glass-card";
import { TYPE_LABEL, type QuestionType, type StudentAnswer } from "@/lib/assessments/questions";
import { cn } from "@/lib/utils/format";

export type RunnerQuestion = { id: string; position: number; type: QuestionType; prompt: string; options: string[]; points: number };

type Submit = typeof submitAttempt;

function answered(a: StudentAnswer | undefined): boolean {
  if (!a) return false;
  return a.option !== undefined || a.value !== undefined || Boolean(a.text?.trim());
}

export function QuizRunner({
  title,
  attemptId,
  startedAt,
  timeLimitSeconds,
  questions,
  submit = submitAttempt,
  onSubmitted,
}: {
  title: string;
  attemptId: string;
  startedAt: string;
  timeLimitSeconds: number | null;
  questions: RunnerQuestion[];
  submit?: Submit;
  onSubmitted?: (attemptId: string) => void;
}) {
  const router = useRouter();
  const draftKey = `mf-quiz-${attemptId}`;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, StudentAnswer>>({});
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const submitted = useRef(false);

  // Restore a draft (refresh / accidental navigation never loses answers). Saving
  // starts only after the restore, so an empty initial state never overwrites it.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring browser-only storage after mount
      if (raw) setAnswers(JSON.parse(raw) as Record<string, StudentAnswer>);
    } catch {
      /* storage unavailable */
    }
    setRestored(true);
  }, [draftKey]);
  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(answers));
    } catch {
      /* storage unavailable */
    }
  }, [answers, draftKey, restored]);

  const deadline = timeLimitSeconds ? new Date(startedAt).getTime() + timeLimitSeconds * 1000 : null;
  const remaining = deadline ? Math.max(0, Math.round((deadline - now) / 1000)) : null;

  const doSubmit = useCallback(() => {
    if (submitted.current) return;
    submitted.current = true;
    start(async () => {
      setError(undefined);
      const r = await submit({ attemptId, answers });
      if (!r.ok) {
        submitted.current = false;
        setError(r.error);
        return;
      }
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      if (onSubmitted) onSubmitted(r.attemptId);
      else router.push(`/assessments/attempts/${r.attemptId}`);
    });
  }, [answers, attemptId, draftKey, onSubmitted, router, submit]);

  useEffect(() => {
    if (!deadline) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [deadline]);
  // Time's up: submit automatically.
  useEffect(() => {
    if (remaining === 0 && !submitted.current) doSubmit();
  }, [remaining, doSubmit]);

  const q = questions[index];
  const a = answers[q.id];
  const set = (v: StudentAnswer) => setAnswers((s) => ({ ...s, [q.id]: v }));
  const answeredCount = useMemo(() => questions.filter((x) => answered(answers[x.id])).length, [answers, questions]);
  const last = index === questions.length - 1;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-fg-2">Test your understanding · {answeredCount}/{questions.length} answered</p>
        </div>
        {remaining !== null && (
          <span
            className={cn("glass flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold tabular-nums", remaining < 60 ? "text-error" : "text-accent")}
            role="timer"
            aria-label={`Time remaining ${fmt(remaining)}`}
          >
            <Clock className="size-4" aria-hidden="true" /> {fmt(remaining)}
          </span>
        )}
      </div>

      <nav aria-label="Questions" className="flex flex-wrap gap-1.5">
        {questions.map((x, i) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setIndex(i)}
            aria-current={i === index ? "step" : undefined}
            aria-label={`Question ${i + 1}${answered(answers[x.id]) ? ", answered" : ""}`}
            className={cn(
              "focus-ring size-9 rounded-xl text-xs font-semibold transition",
              i === index ? "bg-accent text-[#0b0c0b]" : answered(answers[x.id]) ? "border border-accent/50 bg-accent/10 text-accent" : "border border-line text-fg-2 hover:text-fg",
            )}
          >
            {i + 1}
          </button>
        ))}
      </nav>

      <GlassCard className="p-5 sm:p-6">
        <p className="text-sm font-semibold text-accent">
          Question {index + 1} of {questions.length}
          <span className="ml-2 font-normal text-fg-2">· {TYPE_LABEL[q.type]} · {q.points} {q.points === 1 ? "mark" : "marks"}</span>
        </p>
        <h2 className="mt-3 text-lg font-semibold leading-snug sm:text-xl" id={`q-${q.id}`}>{q.prompt}</h2>

        <div className="mt-5" role="group" aria-labelledby={`q-${q.id}`}>
          {q.type === "mcq" && (
            <ul className="space-y-2.5">
              {q.options.map((o, i) => {
                const on = a?.option === i;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => set({ option: i })}
                      className={cn("focus-ring flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left text-sm transition", on ? "border-accent bg-accent/15 glow-accent" : "border-line bg-white/[0.03] hover:border-line-strong")}
                    >
                      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border-2", on ? "border-accent bg-accent text-[#0b0c0b]" : "border-line-strong")}>
                        {on && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}
                      </span>
                      {o}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {q.type === "true_false" && (
            <div className="grid grid-cols-2 gap-3">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  role="radio"
                  aria-checked={a?.value === v}
                  onClick={() => set({ value: v })}
                  className={cn("focus-ring h-14 rounded-2xl border text-sm font-semibold", a?.value === v ? "border-accent bg-accent/15 text-accent glow-accent" : "border-line bg-white/[0.03] hover:border-line-strong")}
                >
                  {v ? "True" : "False"}
                </button>
              ))}
            </div>
          )}
          {q.type === "fill_blank" && (
            <input
              aria-label="Your answer"
              value={a?.text ?? ""}
              onChange={(e) => set({ text: e.target.value })}
              maxLength={300}
              placeholder="Type the missing word or phrase"
              className="glass h-14 w-full rounded-2xl px-4 text-[15px] outline-none focus:border-accent/60"
            />
          )}
          {(q.type === "short_answer" || q.type === "theory") && (
            <textarea
              aria-label="Your answer"
              value={a?.text ?? ""}
              onChange={(e) => set({ text: e.target.value })}
              maxLength={6000}
              rows={q.type === "theory" ? 9 : 4}
              placeholder={q.type === "theory" ? "Explain in your own words. Cover the key ideas." : "Answer in one to three sentences."}
              className="w-full resize-y rounded-2xl border border-line bg-white/[0.04] p-4 text-[15px] outline-none focus:border-accent/60"
            />
          )}
        </div>
      </GlassCard>

      {error && <FormMessage>{error}</FormMessage>}

      <div className="flex items-center gap-3">
        <Button variant="secondary" size="lg" className="w-14 px-0" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} aria-label="Previous question">
          <ArrowLeft className="size-5" />
        </Button>
        {last ? (
          <Button size="lg" className="flex-1" onClick={() => setConfirm(true)} loading={pending}>
            <Flag className="size-4" aria-hidden="true" /> Submit quiz
          </Button>
        ) : (
          <Button size="lg" className="flex-1" onClick={() => setIndex((i) => i + 1)}>
            Next Question <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        )}
        {!last && (
          <span className="hidden sm:block">
            <Button variant="secondary" size="lg" onClick={() => setConfirm(true)}>
              Submit
            </Button>
          </span>
        )}
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Submit your answers?"
        description={
          answeredCount < questions.length
            ? `You've answered ${answeredCount} of ${questions.length} questions. Unanswered questions score zero.`
            : "You've answered every question. You can't change answers after submitting."
        }
        confirmLabel="Submit"
        busy={pending}
        onConfirm={() => {
          setConfirm(false);
          doSubmit();
        }}
      />
      {pending && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm" role="status">
          <Loader2 className="size-8 animate-spin text-accent" aria-hidden="true" />
          <p className="text-sm">Marking your answers…</p>
        </div>
      )}
    </div>
  );
}
