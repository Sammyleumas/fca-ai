import { GuestButton } from "@/components/auth/guest-button";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  BrainCircuit,
  CalendarDays,
  ClipboardCheck,
  Flame,
  UploadCloud,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { SilkBackground } from "@/components/brand/silk-background";
import { ButtonLink } from "@/components/ui/button";

const STEPS = [
  { icon: UploadCloud, title: "Upload", text: "Bring PDFs, Word documents and notes — as many as you need." },
  { icon: BrainCircuit, title: "Organise", text: "AI finds chapters, topics and bite-sized learning units." },
  { icon: CalendarDays, title: "Plan", text: "Get a realistic plan around your deadline and daily time." },
  { icon: BookOpenText, title: "Read", text: "Study in a calm reading room with highlights and notes." },
  { icon: ClipboardCheck, title: "Practise", text: "Daily quizzes and flashcards built from your own material." },
  { icon: Flame, title: "Improve", text: "See your weak areas and keep a healthy study streak." },
];

export default function WelcomePage() {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <SilkBackground variant="hero" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-6 sm:px-8">
        <Logo withTagline />
        <nav className="hidden items-center gap-2 sm:flex" aria-label="Account">
          <ButtonLink href="/login" variant="ghost">
            Sign In
          </ButtonLink>
          <ButtonLink href="/signup">Get Started</ButtonLink>
        </nav>
      </header>

      <main id="main" className="relative mx-auto flex max-w-6xl flex-col px-4 pb-16 pt-10 sm:px-8 md:pt-20">
        <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl md:text-7xl">
          Your AI <span className="text-gradient-accent">Study</span> Partner
        </h1>
        <p className="mt-6 max-w-xl text-lg text-fg-2 sm:text-xl">
          Upload. Organise. Study. Practise. Track your progress. FCA-AI turns your own learning materials into a
          personal study plan you can actually follow.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/signup" size="lg" className="sm:min-w-52">
            Get Started <ArrowRight className="size-4" aria-hidden="true" />
          </ButtonLink>
          <ButtonLink href="/login" size="lg" variant="secondary" className="sm:min-w-40">
            Sign In
          </ButtonLink>
        </div>
        <GuestButton variant="ghost" note={false} className="mt-3 w-full sm:w-fit [&_button]:sm:px-2" />
        <p className="mt-1 text-sm text-muted">No email needed to try it. Save your work with an account whenever you like.</p>

        <section aria-labelledby="how" className="mt-20 md:mt-28">
          <h2 id="how" className="text-sm font-semibold uppercase tracking-[0.18em] text-fg-2">
            How FCA-AI works
          </h2>
          <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="glass-strong rounded-[var(--radius-glass)] p-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-medium text-muted">0{i + 1}</span>
                </div>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-fg-2">{text}</p>
              </li>
            ))}
          </ol>
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
