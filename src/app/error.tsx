"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button, buttonClasses } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";

/** Friendly fallback for unexpected errors on public pages (welcome, sign-in, sign-up…). */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4">
      <Logo withTagline />
      <GlassCard className="w-full max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-fg-2">Please try again. If it keeps happening, come back in a few minutes.</p>
        {error.digest && <p className="mt-3 font-mono text-xs text-muted">Reference: {error.digest}</p>}
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button onClick={reset}>
            <RotateCcw className="size-4" aria-hidden="true" /> Try again
          </Button>
          <Link href="/" className={buttonClasses({ variant: "secondary" })}>
            Back to home
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
