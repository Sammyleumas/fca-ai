import type { MaterialFileType } from "@/types/db";
import { cn } from "@/lib/utils/format";

const STYLES: Record<MaterialFileType, { bg: string; label: string }> = {
  pdf: { bg: "from-[#ff5a52] to-[#d9302a]", label: "PDF" },
  docx: { bg: "from-[#3d8bff] to-[#1f5fd6]", label: "DOC" },
  txt: { bg: "from-[#9aa39a] to-[#5f665f]", label: "TXT" },
};

/** Document-type tile with a folded corner, as in the library designs. */
export function FileBadge({ type, size = 44, className }: { type: MaterialFileType; size?: number; className?: string }) {
  const s = STYLES[type];
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-end justify-center rounded-lg bg-gradient-to-br pb-1.5 shadow-lg", s.bg, className)}
      style={{ width: size, height: size * 1.12 }}
      aria-label={`${s.label} file`}
      role="img"
    >
      <span
        aria-hidden="true"
        className="absolute right-0 top-0 rounded-bl-md bg-white/40"
        style={{ width: size * 0.32, height: size * 0.32 }}
      />
      <span className="text-[10px] font-bold tracking-wide text-white" style={{ fontSize: Math.max(9, size * 0.23) }}>
        {s.label}
      </span>
    </span>
  );
}
