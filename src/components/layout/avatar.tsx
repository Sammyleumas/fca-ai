import { cn } from "@/lib/utils/format";

export function Avatar({ name, url, size = 40, className }: { name: string; url?: string | null; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent/50 bg-gradient-to-br from-brand to-accent-2/30 font-semibold text-fg",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-provided avatar URLs from arbitrary hosts
        <img src={url} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initials || "?"
      )}
    </span>
  );
}
