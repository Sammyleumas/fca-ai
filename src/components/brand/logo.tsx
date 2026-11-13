import { useId } from "react";
import { cn } from "@/lib/utils/format";

/** MindFlow "M" mark: two lime folds over a deep olive base. */
export function LogoMark({ className }: { className?: string }) {
  // Unique gradient ids: duplicated ids break when the first copy is display:none.
  const uid = useId().replace(/:/g, "");
  const a = `mf-m-a-${uid}`;
  const b = `mf-m-b-${uid}`;
  return (
    <svg viewBox="0 0 48 40" className={cn("aspect-[6/5] h-8 w-auto shrink-0", className)} aria-hidden="true">
      <defs>
        <linearGradient id={a} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E9FF7A" />
          <stop offset="0.55" stopColor="#D6FF35" />
          <stop offset="1" stopColor="#8DB51F" />
        </linearGradient>
        <linearGradient id={b} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#A9D92D" />
          <stop offset="1" stopColor="#4E6612" />
        </linearGradient>
      </defs>
      <path d="M2 38 L10 4 L24 22 L18 30 L12 20 L8 38 Z" fill={`url(#${a})`} />
      <path d="M24 22 L38 4 L46 38 L38 38 L35 20 L28 30 Z" fill={`url(#${b})`} />
      <path d="M38 4 L46 38 L41 38 Z" fill="#D6FF35" opacity="0.55" />
    </svg>
  );
}

export function Logo({ className, withTagline = false }: { className?: string; withTagline?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <LogoMark className="h-9" />
      <span className="flex flex-col leading-none">
        <span className="text-[1.35rem] font-semibold tracking-tight text-fg">MindFlow</span>
        {withTagline && <span className="mt-1 text-[11px] text-fg-2">Study Smarter. Achieve More.</span>}
      </span>
    </span>
  );
}
