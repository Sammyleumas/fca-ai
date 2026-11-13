import { cn } from "@/lib/utils/format";

/*
 * FCA-AI mark: a shield crowned with a small diamond, with two interlocking
 * rings cut out of it. Variants follow the brand sheet (yellow / blue / mono).
 */
const VARIANTS = {
  // Yellow shield, rings cut in the page colour (default on the dark UI).
  yellow: { shield: "#FFEB3B", rings: "var(--mf-bg, #03031A)", diamond: "#FFEB3B" },
  // White shield with royal-blue rings (on blue surfaces).
  white: { shield: "#FFFFFF", rings: "#0000A1", diamond: "#FFFFFF" },
  // Royal-blue shield with white rings (on light surfaces).
  blue: { shield: "#0000A1", rings: "#FFFFFF", diamond: "#0000A1" },
  black: { shield: "#000000", rings: "#FFFFFF", diamond: "#000000" },
} as const;

export type LogoVariant = keyof typeof VARIANTS;

export function LogoMark({ className, variant = "yellow" }: { className?: string; variant?: LogoVariant }) {
  const c = VARIANTS[variant];
  return (
    <svg viewBox="0 0 48 56" className={cn("aspect-[6/7] h-8 w-auto shrink-0", className)} aria-hidden="true">
      <ShieldMark shield={c.shield} rings={c.rings} diamond={c.diamond} />
    </svg>
  );
}

/** Raw shapes (shared with the app icon). */
export function ShieldMark({ shield, rings, diamond }: { shield: string; rings: string; diamond: string }) {
  return (
    <>
      <path d="M24 0.8 L27 3.8 L24 6.8 L21 3.8 Z" fill={diamond} />
      <path d="M5 12.5 C12 11.6 18.5 9.6 24 7.6 C29.5 9.6 36 11.6 43 12.5 L43 27 C43 40 34.5 50.5 24 55 C13.5 50.5 5 40 5 27 Z" fill={shield} />
      {/* Two interlocking rings: the right ring passes over the left at the bottom, under it at the top. */}
      <g fill="none" stroke={rings} strokeWidth="3.4">
        <circle cx="17" cy="31.5" r="9.5" />
        <circle cx="31" cy="31.5" r="9.5" />
      </g>
      <path d="M21.46 23.11 A9.5 9.5 0 0 1 25.74 27.79" fill="none" stroke={shield} strokeWidth="6.8" />
      <path d="M21.46 23.11 A9.5 9.5 0 0 1 25.74 27.79" fill="none" stroke={rings} strokeWidth="3.4" strokeLinecap="round" />
    </>
  );
}

export function Logo({ className, withTagline = false }: { className?: string; withTagline?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <LogoMark className="h-9" />
      <span className="flex flex-col leading-none">
        <span className="text-[1.35rem] font-bold tracking-tight text-fg">FCA-AI</span>
        {withTagline && <span className="mt-1 text-[11px] text-fg-2">Study Smarter. Achieve More.</span>}
      </span>
    </span>
  );
}
