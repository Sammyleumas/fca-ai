import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";

export const metadata: Metadata = { title: "Almost ready" };

/** Shown when the database tables don't exist yet (supabase/setup.sql hasn't been run). */
export default function SetupRequired() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-10">
      <Logo withTagline />
      <GlassCard className="w-full max-w-lg p-6 sm:p-8">
        <h1 className="text-xl font-semibold">FCA-AI is almost ready</h1>
        <p className="mt-2 text-fg-2">
          You&apos;re signed in, but the app&apos;s database hasn&apos;t been set up yet, so your study space can&apos;t be created.
        </p>
        <div className="mt-5 rounded-2xl border border-line bg-white/[0.03] p-4 text-sm text-fg-2">
          <p className="font-semibold text-fg">For the site owner</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Open your Supabase project → SQL Editor.</li>
            <li>Paste the whole of <code className="text-fg">supabase/setup.sql</code> from the repository and click Run.</li>
            <li>Reload this page.</li>
          </ol>
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link href="/dashboard" className={buttonClasses({ className: "w-full sm:w-auto" })}>
            Try again
          </Link>
          <Link href="/" className={buttonClasses({ variant: "secondary", className: "w-full sm:w-auto" })}>
            Back to home
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
