import {
  BookOpen,
  CalendarCheck,
  CircleCheck,
  Flame,
  GraduationCap,
  Library,
  Lock,
  Star,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/format";

const ICONS: Record<string, LucideIcon> = {
  star: Star,
  flame: Flame,
  trophy: Trophy,
  "book-open": BookOpen,
  library: Library,
  "calendar-check": CalendarCheck,
  "check-circle": CircleCheck,
  "graduation-cap": GraduationCap,
};

const TINTS = [
  "from-[#ffcf5a] to-[#c9861a] text-[#3b2400]",
  "from-[#5fe08f] to-[#1f8b4c] text-[#04260f]",
  "from-[#b48cff] to-[#6a3fd6] text-white",
  "from-[#ffd36b] to-[#b9871a] text-[#3b2400]",
];

export function AchievementBadge({
  icon,
  earned,
  index = 0,
  size = 64,
}: {
  icon: string;
  earned: boolean;
  index?: number;
  size?: number;
}) {
  const Icon = earned ? (ICONS[icon] ?? Trophy) : Lock;
  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center bg-gradient-to-br",
        earned ? TINTS[index % TINTS.length] : "from-white/12 to-white/4 text-muted",
      )}
      style={{
        width: size,
        height: size,
        clipPath: "polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
        filter: earned ? "drop-shadow(0 6px 14px rgba(0,0,0,0.45))" : undefined,
      }}
      aria-hidden="true"
    >
      <Icon className="size-[42%]" strokeWidth={2.2} />
    </span>
  );
}
