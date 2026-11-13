import { ArrowLeft, Hammer } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";

/**
 * Honest placeholder for a module scheduled in a later build phase. It never
 * pretends a feature works; it says when it is coming and offers a real next step.
 */
export function ComingInPhase({
  title,
  phase,
  description,
  points,
}: {
  title: string;
  phase: number;
  description: string;
  points: string[];
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <GlassCard className="mt-6 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-accent">
            <Hammer className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold">Arriving in build phase {phase}</p>
            <p className="text-sm text-fg-2">This module isn&apos;t available yet.</p>
          </div>
        </div>
        <p className="mt-5 text-fg-2">{description}</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {points.map((p) => (
            <li key={p} className="rounded-xl border border-line bg-white/[0.03] px-3.5 py-2.5 text-sm text-fg-2">
              {p}
            </li>
          ))}
        </ul>
        <ButtonLink href="/dashboard" variant="secondary" className="mt-6">
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to dashboard
        </ButtonLink>
      </GlassCard>
    </div>
  );
}
