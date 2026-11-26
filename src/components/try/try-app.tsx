"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Bot, Check, FileText, Layers, ListChecks, Loader2, RotateCcw, Send, Sparkles, UploadCloud, X } from "lucide-react";
import { RichText } from "@/components/tutor/rich-text";
import { Button, buttonClasses } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/feedback";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils/format";

/*
 * "Try it" mode: the core study loop with no account and no database. Everything
 * (material, chat, quiz answers, flashcard progress) is kept in this browser's
 * localStorage so a refresh never loses work.
 */
type Material = { title: string; text: string; words: number; truncated: boolean };
type Msg = { role: "user" | "assistant"; content: string };
type Question = { type: "mcq" | "true_false"; prompt: string; options: string[]; answer: number; explanation: string };
type Card = { front: string; back: string };
type Tab = "tutor" | "quiz" | "cards";
type State = {
  material: Material | null;
  tab: Tab;
  messages: Msg[];
  quiz: { questions: Question[]; picks: (number | null)[]; checked: boolean } | null;
  cards: { cards: Card[]; index: number; known: number[] } | null;
};

const STORAGE_KEY = "fca-try-v1";
const EMPTY: State = { material: null, tab: "tutor", messages: [], quiz: null, cards: null };
const MAX_CHARS = 60_000;
const SUGGESTIONS = ["Summarise the key ideas", "Explain the hardest concept simply", "What should I memorise?", "Give me an example"];
const ERROR_MARK = /\n*\[\[error:([^\]]*)\]\]\s*$/;

const words = (t: string) => (t.match(/[\p{L}\p{N}]+/gu) ?? []).length;

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data;
}

export function TryApp() {
  const [state, setState] = useState<State>(EMPTY);
  const [restored, setRestored] = useState(false);

  // Restore from this browser (never lose work on refresh), then keep saving.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring browser-only storage after mount
      if (raw) setState({ ...EMPTY, ...(JSON.parse(raw) as Partial<State>) });
    } catch {
      /* storage unavailable or corrupted: start fresh */
    }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or unavailable: keep working in memory */
    }
  }, [state, restored]);

  const update = (patch: Partial<State>) => setState((s) => ({ ...s, ...patch }));

  if (!restored) {
    return (
      <div className="flex justify-center py-20" role="status">
        <Loader2 className="size-6 animate-spin text-accent" aria-hidden="true" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (!state.material) return <MaterialStep onReady={(material) => setState({ ...EMPTY, material })} />;

  const material = state.material;
  // Short labels on phones so nothing is cut off; the full name stays the accessible name.
  const tabs: { id: Tab; label: string; short: string; icon: ReactNode }[] = [
    { id: "tutor", label: "Ask the tutor", short: "Tutor", icon: <Bot className="size-4 shrink-0" aria-hidden="true" /> },
    { id: "quiz", label: "Quiz", short: "Quiz", icon: <ListChecks className="size-4 shrink-0" aria-hidden="true" /> },
    { id: "cards", label: "Flashcards", short: "Cards", icon: <Layers className="size-4 shrink-0" aria-hidden="true" /> },
  ];

  return (
    <div className="space-y-4">
      <GlassCard className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <FileText className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{material.title}</p>
            <p className="text-xs text-fg-2">
              {material.words.toLocaleString("en")} words{material.truncated ? " · only the first part is used" : ""}
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (window.confirm("Start over with different material? This clears your chat, quiz and flashcards in this browser.")) setState(EMPTY);
          }}
        >
          <RotateCcw className="size-4" aria-hidden="true" /> Change material
        </Button>
      </GlassCard>

      <div role="tablist" aria-label="Study tools" className="glass grid grid-cols-3 gap-1 rounded-2xl p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={state.tab === t.id}
            aria-label={t.label}
            onClick={() => update({ tab: t.id })}
            className={cn(
              "focus-ring flex items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-sm font-semibold transition",
              state.tab === t.id ? "bg-accent text-black" : "text-fg-2 hover:text-fg",
            )}
          >
            {t.icon}
            <span className="truncate sm:hidden" aria-hidden="true">{t.short}</span>
            <span className="hidden truncate sm:inline" aria-hidden="true">{t.label}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {state.tab === "tutor" && <TutorPanel material={material} messages={state.messages} onMessages={(messages) => setState((s) => ({ ...s, messages }))} />}
        {state.tab === "quiz" && <QuizPanel material={material} quiz={state.quiz} onQuiz={(quiz) => setState((s) => ({ ...s, quiz }))} />}
        {state.tab === "cards" && <CardsPanel material={material} deck={state.cards} onDeck={(cards) => setState((s) => ({ ...s, cards }))} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ material */

function MaterialStep({ onReady }: { onReady: (m: Material) => void }) {
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError(undefined);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/try/extract", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { error?: string; title?: string; text?: string; truncated?: boolean; words?: number };
      if (!res.ok || !data.text) throw new Error(data.error ?? "We couldn't read that file.");
      onReady({ title: data.title || file.name, text: data.text, words: words(data.text), truncated: Boolean(data.truncated) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't read that file.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function usePasted() {
    const t = text.trim();
    if (words(t) < 10) {
      setError("Paste a bit more — at least a few sentences of your notes.");
      return;
    }
    onReady({ title: title.trim() || "My notes", text: t.slice(0, MAX_CHARS), words: words(t), truncated: t.length > MAX_CHARS });
  }

  return (
    <GlassCard className="p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Add your study material</h2>
      <p className="mt-1 text-sm text-fg-2">Paste notes or upload a PDF, Word or text file. Then ask the AI tutor, take a quiz or review flashcards.</p>

      <div role="tablist" aria-label="How to add material" className="mt-5 grid grid-cols-2 gap-1 rounded-2xl border border-line p-1">
        {(["paste", "upload"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(undefined);
            }}
            className={cn("focus-ring rounded-xl py-2 text-sm font-semibold", mode === m ? "bg-white/10 text-fg" : "text-fg-2 hover:text-fg")}
          >
            {m === "paste" ? "Paste text" : "Upload a file"}
          </button>
        ))}
      </div>

      {mode === "paste" ? (
        <div className="mt-4 space-y-3">
          <input
            aria-label="Title (optional)"
            placeholder="Title (optional), e.g. Biology – Cells"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            className="glass h-12 w-full rounded-2xl px-4 text-[15px] outline-none focus:border-accent/60"
          />
          <textarea
            aria-label="Your notes"
            placeholder="Paste your lecture notes, a textbook section or an article here…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            className="w-full resize-y rounded-2xl border border-line bg-white/[0.04] p-4 text-[15px] outline-none focus:border-accent/60"
          />
          <div className="flex items-center justify-between gap-3 text-xs text-muted">
            <span>{words(text).toLocaleString("en")} words</span>
            {text.length > MAX_CHARS && <span>Only the first {MAX_CHARS.toLocaleString("en")} characters will be used.</span>}
          </div>
          <Button size="lg" className="w-full" onClick={usePasted}>
            Start studying <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line-strong px-6 py-10 text-center hover:border-accent/60 hover:bg-white/[0.03]">
          {busy ? <Loader2 className="size-9 animate-spin text-accent" aria-hidden="true" /> : <UploadCloud className="size-9 text-accent" aria-hidden="true" />}
          <span className="mt-3 font-semibold">{busy ? "Reading your file…" : "Choose a file"}</span>
          <span className="mt-1 text-sm text-fg-2">PDF, DOCX or TXT · up to 4 MB</span>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </label>
      )}
      {error && <FormMessage className="mt-4">{error}</FormMessage>}
    </GlassCard>
  );
}

/* --------------------------------------------------------------------- tutor */

function TutorPanel({ material, messages, onMessages }: { material: Material; messages: Msg[]; onMessages: (m: Msg[]) => void }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Block body on purpose: newer browsers return a Promise from scrollIntoView,
    // and React would try to call it as the effect's cleanup.
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setError(undefined);
    setBusy(true);
    setInput("");
    const history: Msg[] = [...messages, { role: "user", content }];
    onMessages([...history, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/try/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ material: { title: material.title, text: material.text }, messages: history.slice(-21) }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "The AI tutor is unavailable right now.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        onMessages([...history, { role: "assistant", content: acc.replace(ERROR_MARK, "") }]);
      }
      const err = acc.match(ERROR_MARK);
      const answer = acc.replace(ERROR_MARK, "").trim();
      onMessages(answer ? [...history, { role: "assistant", content: answer }] : history);
      if (err) throw new Error(err[1]);
    } catch (e) {
      // Keep the student's question; drop the empty reply.
      onMessages(history);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard className="flex min-h-[26rem] flex-col p-4 sm:p-5">
      <div className="flex-1 space-y-3" aria-live="polite">
        {messages.length === 0 ? (
          <div className="py-4 text-center">
            <p className="font-semibold">Ask anything about “{material.title}”</p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => send(s)} className="focus-ring glass flex w-full items-start gap-2 rounded-2xl p-3 text-left text-sm text-fg-2 hover:text-fg">
                    <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" /> {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[88%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed", m.role === "user" ? "bg-accent text-black" : "glass")}>
                {m.role === "assistant" ? (
                  m.content ? <RichText text={m.content} /> : <Loader2 className="size-4 animate-spin text-accent" aria-label="Thinking" />
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
      {error && <FormMessage className="mt-3">{error}</FormMessage>}
      <form
        className="mt-4 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          aria-label="Your question"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          maxLength={2000}
          rows={1}
          placeholder="Ask about your notes…"
          className="max-h-40 min-h-12 flex-1 resize-none rounded-2xl border border-line bg-white/[0.04] px-4 py-3 text-[15px] outline-none focus:border-accent/60"
        />
        <Button type="submit" size="md" className="size-12 px-0" disabled={busy || !input.trim()} aria-label="Send">
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Send className="size-5" aria-hidden="true" />}
        </Button>
      </form>
    </GlassCard>
  );
}

/* ---------------------------------------------------------------------- quiz */

function QuizPanel({ material, quiz, onQuiz }: { material: Material; quiz: State["quiz"]; onQuiz: (q: State["quiz"]) => void }) {
  const [count, setCount] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function generate() {
    setBusy(true);
    setError(undefined);
    try {
      const { questions } = await postJSON<{ questions: Question[] }>("/api/try/quiz", { material: { title: material.title, text: material.text }, count });
      onQuiz({ questions, picks: questions.map(() => null), checked: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make a quiz.");
    } finally {
      setBusy(false);
    }
  }

  if (!quiz) {
    return (
      <GlassCard className="p-5 text-center sm:p-6">
        <ListChecks className="mx-auto size-10 text-accent" aria-hidden="true" />
        <p className="mt-3 font-semibold">Test yourself on “{material.title}”</p>
        <p className="mt-1 text-sm text-fg-2">Multiple-choice and true/false questions, marked instantly.</p>
        <div className="mt-5 flex items-center justify-center gap-2" role="radiogroup" aria-label="Number of questions">
          {[5, 8, 12].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={count === n}
              onClick={() => setCount(n)}
              className={cn("focus-ring rounded-full border px-4 py-1.5 text-sm font-semibold", count === n ? "border-accent bg-accent/15 text-accent" : "border-line text-fg-2")}
            >
              {n} questions
            </button>
          ))}
        </div>
        <Button size="lg" className="mt-5 w-full sm:w-auto" loading={busy} onClick={generate}>
          {busy ? "Writing your quiz…" : "Create quiz"}
        </Button>
        {error && <FormMessage className="mt-4 text-left">{error}</FormMessage>}
      </GlassCard>
    );
  }

  const score = quiz.questions.reduce((n, q, i) => n + (quiz.picks[i] === q.answer ? 1 : 0), 0);
  const answered = quiz.picks.filter((p) => p !== null).length;
  const pick = (qi: number, v: number) => {
    if (quiz.checked) return;
    onQuiz({ ...quiz, picks: quiz.picks.map((p, i) => (i === qi ? v : p)) });
  };

  return (
    <div className="space-y-3">
      {quiz.checked && (
        <GlassCard className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="text-2xl font-semibold">
              {score} / {quiz.questions.length}
            </p>
            <p className="text-sm text-fg-2">{score === quiz.questions.length ? "Perfect score — well done!" : "Review the explanations below, then try a new quiz."}</p>
          </div>
          <Button variant="secondary" onClick={() => onQuiz(null)}>
            <RotateCcw className="size-4" aria-hidden="true" /> New quiz
          </Button>
        </GlassCard>
      )}
      {quiz.questions.map((q, qi) => {
        const options = q.type === "mcq" ? q.options : ["False", "True"];
        const order = q.type === "mcq" ? options.map((_, i) => i) : [1, 0];
        return (
          <GlassCard key={qi} className="p-4 sm:p-5">
            <p className="text-xs font-semibold text-accent">
              Question {qi + 1} · {q.type === "mcq" ? "Multiple choice" : "True or false"}
            </p>
            <p className="mt-2 font-semibold" id={`tq-${qi}`}>
              {q.prompt}
            </p>
            <div className="mt-3 grid gap-2" role="radiogroup" aria-labelledby={`tq-${qi}`}>
              {order.map((oi) => {
                const chosen = quiz.picks[qi] === oi;
                const correct = quiz.checked && oi === q.answer;
                const wrong = quiz.checked && chosen && oi !== q.answer;
                return (
                  <button
                    key={oi}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    disabled={quiz.checked}
                    onClick={() => pick(qi, oi)}
                    className={cn(
                      "focus-ring flex items-center gap-3 rounded-2xl border p-3 text-left text-sm transition",
                      correct ? "border-success bg-success/15" : wrong ? "border-error bg-error/10" : chosen ? "border-accent bg-accent/15" : "border-line bg-white/[0.03] hover:border-line-strong",
                    )}
                  >
                    <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border-2", chosen ? "border-accent bg-accent text-black" : "border-line-strong")}>
                      {correct ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : wrong ? <X className="size-3.5" strokeWidth={3} aria-hidden="true" /> : null}
                    </span>
                    {options[oi]}
                  </button>
                );
              })}
            </div>
            {quiz.checked && <p className="mt-3 rounded-xl bg-white/[0.04] p-3 text-sm text-fg-2">{q.explanation}</p>}
          </GlassCard>
        );
      })}
      {!quiz.checked && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" className="flex-1" onClick={() => onQuiz({ ...quiz, checked: true })} disabled={answered === 0}>
            Check answers ({answered}/{quiz.questions.length})
          </Button>
          <Button variant="secondary" size="lg" onClick={() => onQuiz(null)}>
            New quiz
          </Button>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- flashcards */

function CardsPanel({ material, deck, onDeck }: { material: Material; deck: State["cards"]; onDeck: (d: State["cards"]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [flipped, setFlipped] = useState(false);

  async function generate() {
    setBusy(true);
    setError(undefined);
    try {
      const { cards } = await postJSON<{ cards: Card[] }>("/api/try/flashcards", { material: { title: material.title, text: material.text }, count: 12 });
      onDeck({ cards, index: 0, known: [] });
      setFlipped(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make flashcards.");
    } finally {
      setBusy(false);
    }
  }

  if (!deck) {
    return (
      <GlassCard className="p-5 text-center sm:p-6">
        <Layers className="mx-auto size-10 text-accent" aria-hidden="true" />
        <p className="mt-3 font-semibold">Flashcards for “{material.title}”</p>
        <p className="mt-1 text-sm text-fg-2">Key terms and ideas from your material. Tap a card to reveal the answer.</p>
        <Button size="lg" className="mt-5 w-full sm:w-auto" loading={busy} onClick={generate}>
          {busy ? "Making your cards…" : "Create flashcards"}
        </Button>
        {error && <FormMessage className="mt-4 text-left">{error}</FormMessage>}
      </GlassCard>
    );
  }

  const card = deck.cards[deck.index];
  const go = (delta: number) => {
    setFlipped(false);
    onDeck({ ...deck, index: (deck.index + delta + deck.cards.length) % deck.cards.length });
  };
  const mark = (knowIt: boolean) => {
    const known = knowIt ? [...new Set([...deck.known, deck.index])] : deck.known.filter((i) => i !== deck.index);
    setFlipped(false);
    onDeck({ ...deck, known, index: (deck.index + 1) % deck.cards.length });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-fg-2">
        <span>
          Card {deck.index + 1} of {deck.cards.length}
        </span>
        <span>
          {deck.known.length} / {deck.cards.length} known
        </span>
      </div>
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Show the question" : "Show the answer"}
        className="focus-ring glass flex min-h-56 w-full flex-col items-center justify-center rounded-3xl p-6 text-center"
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-accent">{flipped ? "Answer" : "Question"}</span>
        <span className="mt-3 text-lg font-semibold leading-snug">{flipped ? card.back : card.front}</span>
        {!flipped && <span className="mt-4 text-xs text-muted">Tap to reveal</span>}
      </button>
      <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2">
        <Button variant="secondary" size="lg" className="w-12 px-0" onClick={() => go(-1)} aria-label="Previous card">
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Button>
        <Button variant="secondary" size="lg" onClick={() => mark(false)}>
          Again
        </Button>
        <Button size="lg" onClick={() => mark(true)}>
          I know it
        </Button>
        <Button variant="secondary" size="lg" className="w-12 px-0" onClick={() => go(1)} aria-label="Next card">
          <ArrowRight className="size-5" aria-hidden="true" />
        </Button>
      </div>
      <div className="text-center">
        <button type="button" onClick={generate} disabled={busy} className="focus-ring rounded text-sm text-fg-2 hover:text-fg">
          {busy ? "Making new cards…" : "Make a new set"}
        </button>
      </div>
      {error && <FormMessage>{error}</FormMessage>}
    </div>
  );
}

export function TryHeaderLinks() {
  return (
    <nav className="flex items-center gap-2" aria-label="Account">
      <Link href="/login" className={buttonClasses({ variant: "ghost", size: "sm" })}>
        Sign in
      </Link>
      <Link href="/signup" className={buttonClasses({ size: "sm" })}>
        Create account
      </Link>
    </nav>
  );
}
