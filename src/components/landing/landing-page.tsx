import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  FileText,
  Layers,
  ListChecks,
  Lock,
  Smartphone,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { SilkBackground } from "@/components/brand/silk-background";
import { ButtonLink } from "@/components/ui/button";

const STUDY_HREF = "/study";

/* Only what the open (no-account) app really does today. */
const FEATURES = [
  { icon: UploadCloud, title: "Bring your own notes", text: "Paste text or upload a PDF, Word or text file (up to 4 MB)." },
  { icon: Bot, title: "AI tutor", text: "Ask questions and get clear answers based on your own material." },
  { icon: ListChecks, title: "Instant quizzes", text: "Multiple-choice and true/false questions with explanations." },
  { icon: Layers, title: "Flashcards", text: "Flip, test yourself and mark what you already know." },
  { icon: Lock, title: "Private by default", text: "No account. Your work stays in your own browser." },
  { icon: Smartphone, title: "Phone or computer", text: "Works in any modern browser. Nothing to install." },
];

const STEPS = [
  { title: "Add your notes", text: "Paste them in or upload the file you're studying from." },
  { title: "Ask and practise", text: "Chat with the tutor, then take a quiz or review flashcards." },
  { title: "Come back anytime", text: "Your chat, quiz and cards are still there on this device." },
];

const FAQ = [
  { q: "Is it free?", a: "Yes. There's no sign-up and nothing to pay." },
  { q: "Do I need an account?", a: "No. Open the app and start studying straight away." },
  {
    q: "Where are my notes saved?",
    a: "Only in your browser on this device. They're sent to the AI to answer you, but we don't store them. Clearing your browser data removes them.",
  },
  { q: "Which files can I upload?", a: "PDF, Word (.docx) and plain-text files up to 4 MB. Scanned PDFs without selectable text can't be read yet." },
  { q: "Can the AI make mistakes?", a: "Yes, sometimes. It answers from your notes, but always double-check anything important." },
];

export function LandingPage() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <SilkBackground variant="hero" />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-8 sm:py-6">
        <Link href="/" className="focus-ring rounded-xl" aria-label="FCA-AI home">
          <Logo withTagline />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
          <a href="#features" className="focus-ring hidden rounded-full px-3 py-2 text-sm text-fg-2 hover:text-fg md:inline">
            Features
          </a>
          <a href="#how" className="focus-ring hidden rounded-full px-3 py-2 text-sm text-fg-2 hover:text-fg md:inline">
            How it works
          </a>
          <a href="#faq" className="focus-ring hidden rounded-full px-3 py-2 text-sm text-fg-2 hover:text-fg md:inline">
            FAQ
          </a>
          <ButtonLink href={STUDY_HREF} size="sm">
            Open app
          </ButtonLink>
        </nav>
      </header>

      <main id="main" className="relative">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-8 sm:px-8 md:pt-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="fca-rise">
            <p className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              <Sparkles className="size-3.5" aria-hidden="true" /> Free · No sign-up
            </p>
            <h1 className="mt-5 text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl md:text-7xl">
              Your AI <span className="text-gradient-accent">Study</span> Partner
            </h1>
            <p className="mt-6 max-w-xl text-lg text-fg-2 sm:text-xl">
              Turn your own notes into answers, quizzes and flashcards in seconds. Just open FCA-AI and start studying.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href={STUDY_HREF} size="lg" className="sm:min-w-56">
                Start studying free <ArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>
              <ButtonLink href="#how" size="lg" variant="secondary" className="sm:min-w-40">
                How it works
              </ButtonLink>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-fg-2">
              {["No account", "Works on your phone", "PDF & Word"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="size-4 text-accent" aria-hidden="true" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <HeroPreview />
        </section>

        {/* Features */}
        <section id="features" aria-labelledby="features-title" className="mx-auto max-w-6xl scroll-mt-6 px-4 py-16 sm:px-8">
          <h2 id="features-title" className="text-sm font-semibold uppercase tracking-[0.18em] text-fg-2">
            Everything you need to revise
          </h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="glass-strong rounded-[var(--radius-glass)] p-5">
                <span className="flex size-10 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-fg-2">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section id="how" aria-labelledby="how-title" className="mx-auto max-w-6xl scroll-mt-6 px-4 py-16 sm:px-8">
          <h2 id="how-title" className="text-sm font-semibold uppercase tracking-[0.18em] text-fg-2">
            How it works
          </h2>
          <ol className="mt-6 grid gap-3 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="glass rounded-[var(--radius-glass)] p-6">
                <span className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-black">{i + 1}</span>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-fg-2">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="mx-auto max-w-3xl scroll-mt-6 px-4 py-16 sm:px-8">
          <h2 id="faq-title" className="text-center text-3xl font-semibold tracking-tight">
            Questions
          </h2>
          <div className="mt-8 space-y-3">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="glass group rounded-2xl px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg font-semibold">
                  {q}
                  <span className="text-xl leading-none text-accent transition group-open:rotate-45" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-fg-2">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final call to action */}
        <section className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-8">
          <div className="glass-strong glow-accent relative overflow-hidden rounded-[2rem] px-6 py-12 text-center sm:px-12">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ready to study smarter?</h2>
            <p className="mx-auto mt-3 max-w-md text-fg-2">Open the app, add your notes and ask your first question.</p>
            <ButtonLink href={STUDY_HREF} size="lg" className="mt-8">
              Start studying free <ArrowRight className="size-4" aria-hidden="true" />
            </ButtonLink>
          </div>
        </section>
      </main>

      <footer className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-line px-4 py-6 text-sm text-muted sm:px-8">
        <span>© {new Date().getFullYear()} FCA-AI · Study Smarter. Achieve More.</span>
        <span className="flex gap-4">
          <Link href="/legal/terms" className="hover:text-fg">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-fg">Privacy</Link>
        </span>
      </footer>
    </div>
  );
}

/** Decorative preview of the app (not interactive, hidden from screen readers). */
function HeroPreview() {
  return (
    <div aria-hidden="true" className="fca-rise relative mx-auto w-full max-w-md [animation-delay:150ms]">
      <div className="glass-strong rounded-[2rem] p-4 sm:p-5">
        <div className="flex items-center gap-3 rounded-2xl border border-line p-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <FileText className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Biology — Photosynthesis</p>
            <p className="text-xs text-fg-2">1,240 words</p>
          </div>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <p className="ml-auto w-fit max-w-[80%] rounded-2xl bg-accent px-4 py-2.5 text-black">Where does photosynthesis happen?</p>
          <p className="glass w-fit max-w-[88%] rounded-2xl px-4 py-2.5 leading-relaxed">
            In the <strong className="font-semibold">chloroplasts</strong>, where chlorophyll captures light energy to make glucose.
          </p>
        </div>
        <div className="mt-4 rounded-2xl border border-line p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-2">Quiz · 1 of 8</p>
          <p className="mt-1.5 text-sm font-semibold">Which gas is released?</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <span className="rounded-xl border border-line px-3 py-2">Carbon dioxide</span>
            <span className="flex items-center justify-between rounded-xl border border-success/60 bg-success/10 px-3 py-2">
              Oxygen <Check className="size-3.5 text-success" />
            </span>
          </div>
        </div>
      </div>
      <div className="glass absolute -bottom-6 -left-4 hidden rotate-[-4deg] rounded-2xl px-4 py-3 text-sm sm:block">
        <p className="text-xs text-fg-2">Flashcard</p>
        <p className="font-semibold">Calvin cycle</p>
      </div>
    </div>
  );
}
