"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BookOpenText, Check, Flame, SkipForward, Undo2 } from "lucide-react";
import { setTaskDone, setTaskSkipped } from "@/app/(app)/planner/actions";
import type { SessionTask } from "@/lib/data/planner";
import { cn, formatMinutes } from "@/lib/utils/format";

/** A study task with an optimistic completion checkbox (completion feeds streaks & XP). */
export function TaskRow({ task, readHref, disabled }: { task: SessionTask; readHref?: string; disabled?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState(task.status);
  const [msg, setMsg] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const done = status === "completed";
  const skipped = status === "skipped";

  const toggle = () =>
    start(async () => {
      const next = !done;
      setStatus(next ? "completed" : "pending");
      setError(undefined);
      const r = await setTaskDone(task.id, next);
      if (!r.ok) {
        setStatus(task.status);
        setError(r.error);
        return;
      }
      if (next) {
        const parts = [];
        if (r.newAchievements?.length) parts.push(`Achievement unlocked: ${r.newAchievements.map((a) => a.name).join(", ")}!`);
        else if (r.sessionCompleted) parts.push("Session complete — great work!");
        if (r.streak) parts.push(`${r.streak}-day streak`);
        setMsg(parts.join(" · ") || undefined);
      } else setMsg(undefined);
      router.refresh();
    });

  const skip = () =>
    start(async () => {
      const next = !skipped;
      setStatus(next ? "skipped" : "pending");
      const r = await setTaskSkipped(task.id, next);
      if (!r.ok) {
        setStatus(task.status);
        setError(r.error);
      } else router.refresh();
    });

  const pages = task.start_page ? `p. ${task.start_page}${task.end_page && task.end_page !== task.start_page ? `–${task.end_page}` : ""}` : null;
  return (
    <li className={cn("rounded-2xl border border-line bg-white/[0.03] p-3", skipped && "opacity-60")}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={pending || disabled || skipped}
          aria-pressed={done}
          aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
          className={cn(
            "focus-ring mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition",
            done ? "border-accent bg-accent text-[#0b0c0b] shadow-[0_0_12px_rgba(214,255,53,0.6)]" : "border-line-strong hover:border-accent",
          )}
        >
          {done && <Check className="size-4" strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-medium", done && "text-fg-2 line-through decoration-accent/60")}>{task.title}</p>
          <p className="text-xs text-fg-2">
            {[task.materialTitle, pages, task.estimated_minutes ? formatMinutes(task.estimated_minutes) : null].filter(Boolean).join(" · ")}
            {skipped && " · skipped"}
          </p>
          {msg && (
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-accent" role="status">
              <Flame className="size-3.5" aria-hidden="true" /> {msg}
            </p>
          )}
          {error && <p className="mt-1 text-xs text-error" role="alert">{error}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {readHref && !done && (
            <Link href={readHref} className="focus-ring flex size-9 items-center justify-center rounded-full text-fg-2 hover:bg-white/5 hover:text-accent" aria-label={`Read ${task.title}`}>
              <BookOpenText className="size-4" />
            </Link>
          )}
          {!done && (
            <button type="button" onClick={skip} disabled={pending || disabled} className="focus-ring flex size-9 items-center justify-center rounded-full text-fg-2 hover:bg-white/5 hover:text-fg" aria-label={skipped ? `Restore "${task.title}"` : `Skip "${task.title}"`}>
              {skipped ? <Undo2 className="size-4" /> : <SkipForward className="size-4" />}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
