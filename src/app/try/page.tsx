import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { SilkBackground } from "@/components/brand/silk-background";
import { TryApp, TryHeaderLinks } from "@/components/try/try-app";

export const metadata: Metadata = {
  title: "Try FCA-AI — no account needed",
  description: "Paste or upload your notes, ask the AI tutor, take a quiz and review flashcards. No sign-up.",
};

/** "Try it" mode: works without an account or the database (only the AI service is needed). */
export default function TryPage() {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <SilkBackground variant="page" />
      <header className="relative mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Link href="/" className="focus-ring rounded-xl" aria-label="FCA-AI home">
          <Logo />
        </Link>
        <TryHeaderLinks />
      </header>
      <main id="main" className="relative mx-auto max-w-3xl space-y-4 px-4 pb-16 sm:px-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Try FCA-AI <span className="text-gradient-accent">free</span>
          </h1>
          <p className="mt-2 flex items-start gap-2 text-sm text-fg-2">
            <Info className="mt-0.5 size-4 shrink-0 text-accent-2" aria-hidden="true" />
            No account needed. Your notes, chat, quiz and flashcards are saved only in this browser. Create a free account to keep them
            everywhere and unlock study plans, the reading room and progress tracking.
          </p>
        </div>
        <TryApp />
      </main>
    </div>
  );
}
