"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <GlassCard className="mx-auto mt-10 max-w-lg p-8 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-fg-2">
        We couldn&apos;t load this page. Your progress is safe — please try again.
      </p>
      <Button className="mt-6" onClick={reset}>
        <RotateCcw className="size-4" aria-hidden="true" /> Try again
      </Button>
    </GlassCard>
  );
}
