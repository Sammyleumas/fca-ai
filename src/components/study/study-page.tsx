import Link from "next/link";
import { Info } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { SilkBackground } from "@/components/brand/silk-background";
import { TryApp, TryHeaderLinks } from "@/components/try/try-app";
import { accountsEnabled } from "@/lib/features";

/**
 * The study app that needs no account: notes → AI tutor, quizzes and flashcards.
 * With accounts off it is the home page; with accounts on it is the "Try it" page.
 */
export function StudyPage() {
  const accounts = accountsEnabled();
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <SilkBackground variant="page" />
      <header className="relative mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Link href="/" className="focus-ring rounded-xl" aria-label="FCA-AI home">
          <Logo />
        </Link>
        {accounts && <TryHeaderLinks />}
      </header>
      <main id="main" className="relative mx-auto max-w-3xl space-y-4 px-4 pb-16 sm:px-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {accounts ? (
              <>
                Try FCA-AI <span className="text-gradient-accent">free</span>
              </>
            ) : (
              <>
                Your AI <span className="text-gradient-accent">Study</span> Partner
              </>
            )}
          </h1>
          <p className="mt-2 flex items-start gap-2 text-sm text-fg-2">
            <Info className="mt-0.5 size-4 shrink-0 text-accent-2" aria-hidden="true" />
            {accounts
              ? "No account needed. Your notes, chat, quiz and flashcards are saved only in this browser. Create a free account to keep them everywhere and unlock study plans, the reading room and progress tracking."
              : "No sign-up needed. Your notes, chat, quiz and flashcards are saved only in this browser on this device — clearing your browser data removes them."}
          </p>
        </div>
        <TryApp />
      </main>
      <footer className="relative mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 border-t border-line px-4 py-6 text-sm text-muted sm:px-6">
        <span>© {new Date().getFullYear()} FCA-AI · Study Smarter. Achieve More.</span>
        <span className="flex gap-4">
          <Link href="/legal/terms" className="hover:text-fg">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-fg">Privacy</Link>
        </span>
      </footer>
    </div>
  );
}
