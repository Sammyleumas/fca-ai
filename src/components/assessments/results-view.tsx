import Link from "next/link";
import { BookOpenText, Check, CircleSlash, Layers, RotateCcw, Sparkles, Target, X } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { CardHeader, GlassCard } from "@/components/ui/glass-card";
import { ProgressRing } from "@/components/ui/progress";
import { TYPE_LABEL, type QuestionType } from "@/lib/assessments/questions";
import { cn, formatMinutes } from "@/lib/utils/format";

export type ReviewItem = {
  question_id: string;
  question_position: number;
  question_type: QuestionType;
  prompt: string;
  options: string[];
  correct_answer: Record<string, unknown>;
  explanation: string | null;
  topic: string | null;
  source_material_id: string | null;
  source_page: number | null;
  answer: { option?: number; value?: boolean; text?: string } | null;
  is_correct: boolean | null;
  points: number;
  points_awarded: number | null;
  feedback: string | null;
};

export type ResultsData = {
  quiz: { id: string; title: string; kind: string };
  attempt: { score: number; max_score: number; percent: number; ungraded_count: number };
  feedback: {
    topics?: { topic: string; sectionId: string | null; percent: number; score: number; max: number }[];
    mastered?: string[];
    needs_revision?: string[];
    correct?: number;
    incorrect?: number;
    late?: boolean;
    elapsed_seconds?: number;
  };
  items: ReviewItem[];
  materialTitles: Record<string, string>;
  sectionPages: Record<string, { materialId: string; page: number }>;
  newFlashcards: number;
};

function correctText(i: ReviewItem): string {
  const c = i.correct_answer;
  if ("option" in c) return i.options[c.option as number] ?? "";
  if ("value" in c) return c.value ? "True" : "False";
  if ("accepted" in c) return (c.accepted as string[]).join(" / ");
  return (c.model_answer as string) ?? "";
}
function givenText(i: ReviewItem): string {
  const a = i.answer;
  if (!a) return "No answer";
  if (a.option !== undefined) return i.options[a.option] ?? "No answer";
  if (a.value !== undefined) return a.value ? "True" : "False";
  return a.text?.trim() || "No answer";
}

export function ResultsView({ data }: { data: ResultsData }) {
  const { attempt, feedback, items } = data;
  const pct = Number(attempt.percent);
  const revise = (feedback.topics ?? []).filter((t) => t.percent < 60);
  const verdict = pct >= 85 ? "Excellent work!" : pct >= 70 ? "Good job — nearly there." : pct >= 50 ? "A solid start. Let's strengthen the weak spots." : "Let's revisit these topics together.";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <GlassCard className="p-6">
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <ProgressRing value={pct} size={112} stroke={9} label={`Score ${Math.round(pct)}%`} />
          <div className="flex-1 text-center sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">{data.quiz.title}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{verdict}</h1>
            <p className="mt-1 text-fg-2">
              {Number(attempt.score)} / {Number(attempt.max_score)} marks
              {feedback.elapsed_seconds ? ` · ${formatMinutes(Math.max(1, Math.round(feedback.elapsed_seconds / 60)))}` : ""}
              {feedback.late ? " · submitted after the time limit" : ""}
            </p>
            <dl className="mt-4 flex flex-wrap justify-center gap-3 sm:justify-start">
              {[
                { icon: Check, label: "Correct", value: feedback.correct ?? 0, cls: "text-accent" },
                { icon: X, label: "Incorrect", value: feedback.incorrect ?? 0, cls: "text-error" },
                ...(attempt.ungraded_count ? [{ icon: CircleSlash, label: "Not marked", value: attempt.ungraded_count, cls: "text-warning" }] : []),
              ].map(({ icon: Icon, label, value, cls }) => (
                <div key={label} className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm">
                  <Icon className={cn("size-4", cls)} aria-hidden="true" />
                  <dt className="text-fg-2">{label}</dt>
                  <dd className="font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-5 md:grid-cols-2">
        <GlassCard className="p-5">
          <CardHeader icon={<Target className="size-5" />} title="Topics" />
          <ul className="mt-3 space-y-2">
            {(feedback.topics ?? []).map((t) => (
              <li key={t.topic} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{t.topic}</span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", t.percent >= 80 ? "bg-accent/15 text-accent" : t.percent >= 60 ? "bg-warning/15 text-warning" : "bg-error/15 text-error")}>
                  {t.percent >= 80 ? "Mastered" : t.percent >= 60 ? "Getting there" : "Revise"} · {t.percent}%
                </span>
              </li>
            ))}
          </ul>
        </GlassCard>
        <GlassCard className="p-5">
          <CardHeader icon={<Sparkles className="size-5" />} title="Recommended next steps" />
          <ul className="mt-3 space-y-2 text-sm">
            {revise.map((t) => {
              const loc = t.sectionId ? data.sectionPages[t.sectionId] : undefined;
              return (
                <li key={t.topic}>
                  {loc ? (
                    <Link href={`/reader/${loc.materialId}?page=${loc.page}`} className="focus-ring flex items-center gap-2 rounded-xl border border-line px-3 py-2 hover:border-accent/40">
                      <BookOpenText className="size-4 shrink-0 text-accent" aria-hidden="true" /> Re-read “{t.topic}” (p. {loc.page})
                    </Link>
                  ) : (
                    <span className="flex items-center gap-2 rounded-xl border border-line px-3 py-2"><BookOpenText className="size-4 text-accent" aria-hidden="true" /> Revise “{t.topic}”</span>
                  )}
                </li>
              );
            })}
            {data.newFlashcards > 0 && (
              <li>
                <Link href="/flashcards/review" className="focus-ring flex items-center gap-2 rounded-xl border border-line px-3 py-2 hover:border-accent/40">
                  <Layers className="size-4 shrink-0 text-accent" aria-hidden="true" /> Review your {data.newFlashcards} mistake flashcard{data.newFlashcards === 1 ? "" : "s"}
                </Link>
              </li>
            )}
            {pct >= 80 && !revise.length && <li className="rounded-xl border border-line px-3 py-2 text-fg-2">You&apos;re ready to move on to the next sections in your plan.</li>}
            <li>
              <Link href={`/assessments/${data.quiz.id}`} className="focus-ring flex items-center gap-2 rounded-xl border border-line px-3 py-2 hover:border-accent/40">
                <RotateCcw className="size-4 shrink-0 text-accent" aria-hidden="true" /> Retry this quiz
              </Link>
            </li>
          </ul>
        </GlassCard>
      </div>

      <section aria-labelledby="review-h" className="space-y-3">
        <h2 id="review-h" className="text-lg font-semibold">Review answers</h2>
        {items.map((i, n) => {
          const state = i.points_awarded === null ? "ungraded" : i.is_correct ? "correct" : Number(i.points_awarded) > 0 ? "partial" : "wrong";
          const src = i.source_material_id && i.source_page ? { href: `/reader/${i.source_material_id}?page=${i.source_page}`, label: `${data.materialTitles[i.source_material_id] ?? "Source"} · p. ${i.source_page}` } : null;
          return (
            <GlassCard as="article" key={i.question_id} className={cn("p-5", state === "correct" ? "border-accent/30" : state === "wrong" ? "border-error/30" : "")}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-fg-2">Question {n + 1} · {TYPE_LABEL[i.question_type]}{i.topic ? ` · ${i.topic}` : ""}</p>
                <span className={cn("shrink-0 text-xs font-semibold", state === "correct" ? "text-accent" : state === "wrong" ? "text-error" : "text-warning")}>
                  {state === "ungraded" ? "Not marked" : `${Number(i.points_awarded)}/${Number(i.points)}`}
                </span>
              </div>
              <h3 className="mt-2 font-semibold leading-snug">{i.prompt}</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-xs text-muted">Your answer</dt>
                  <dd className={cn("whitespace-pre-wrap", state === "correct" ? "text-accent" : state === "wrong" ? "text-[#ffb3b3]" : "")}>{givenText(i)}</dd>
                </div>
                {state !== "correct" && (
                  <div>
                    <dt className="text-xs text-muted">{i.question_type === "short_answer" || i.question_type === "theory" ? "Model answer" : "Correct answer"}</dt>
                    <dd className="whitespace-pre-wrap">{correctText(i)}</dd>
                  </div>
                )}
                {i.feedback && (
                  <div>
                    <dt className="text-xs text-muted">Feedback</dt>
                    <dd className="text-fg-2">{i.feedback}</dd>
                  </div>
                )}
                {i.explanation && (
                  <div>
                    <dt className="text-xs text-muted">Explanation</dt>
                    <dd className="text-fg-2">{i.explanation}</dd>
                  </div>
                )}
              </dl>
              {src && (
                <Link href={src.href} className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] hover:border-accent/60">
                  <BookOpenText className="size-3 text-accent" aria-hidden="true" /> {src.label}
                </Link>
              )}
            </GlassCard>
          );
        })}
      </section>
      <div className="flex flex-wrap gap-2">
        <Link href="/assessments" className={buttonClasses({ variant: "secondary" })}>All assessments</Link>
        <Link href="/dashboard" className={buttonClasses({ variant: "ghost" })}>Dashboard</Link>
      </div>
    </div>
  );
}
