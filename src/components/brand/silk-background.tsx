import { cn } from "@/lib/utils/format";

/**
 * Ambient "silk" ribbons from the MindFlow visual identity. Purely decorative,
 * GPU-cheap (static SVG + blur), and hidden from assistive tech.
 */
export function SilkBackground({
  className,
  variant = "page",
}: {
  className?: string;
  variant?: "page" | "hero" | "card";
}) {
  const opacity = variant === "card" ? 0.55 : variant === "hero" ? 0.7 : 0.5;
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <svg
        className="absolute -right-1/4 -top-1/4 h-[150%] w-[150%] md:-right-[10%] md:w-[110%]"
        viewBox="0 0 800 800"
        preserveAspectRatio="xMaxYMin slice"
        style={{ opacity }}
      >
        <defs>
          <linearGradient id="silk-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#D6FF35" stopOpacity="0" />
            <stop offset="0.45" stopColor="#D6FF35" stopOpacity="0.55" />
            <stop offset="0.7" stopColor="#A9D92D" stopOpacity="0.25" />
            <stop offset="1" stopColor="#A9D92D" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="silk-b" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F0FFB0" stopOpacity="0.0" />
            <stop offset="0.5" stopColor="#E4FF7A" stopOpacity="0.35" />
            <stop offset="1" stopColor="#6E8F18" stopOpacity="0" />
          </linearGradient>
          <filter id="silk-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <path
          d="M820 -40 C 620 120, 700 300, 520 420 C 360 530, 260 520, 120 700 L 300 820 C 420 640, 560 600, 660 470 C 780 320, 760 160, 900 40 Z"
          fill="url(#silk-a)"
          filter="url(#silk-blur)"
        />
        <path
          d="M860 120 C 700 240, 720 380, 600 470 C 480 560, 380 600, 300 760"
          fill="none"
          stroke="url(#silk-b)"
          strokeWidth="3"
        />
        <path
          d="M900 220 C 760 300, 760 430, 640 520 C 520 610, 450 660, 400 820"
          fill="none"
          stroke="url(#silk-b)"
          strokeWidth="1.5"
          opacity="0.7"
        />
      </svg>
      <div className="absolute -left-40 bottom-0 h-80 w-80 rounded-full bg-accent/5 blur-3xl" />
    </div>
  );
}
