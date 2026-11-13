import {
  BookOpenText,
  BotMessageSquare,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  House,
  Layers,
  Library,
  Settings,
  Trophy,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; short: string; icon: LucideIcon };

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: House },
  { href: "/library", label: "My Library", short: "Library", icon: Library },
  { href: "/planner", label: "Study Planner", short: "Planner", icon: CalendarDays },
  { href: "/reader", label: "Reading Room", short: "Read", icon: BookOpenText },
  { href: "/tutor", label: "AI Tutor", short: "AI Tutor", icon: BotMessageSquare },
  { href: "/assessments", label: "Assessments", short: "Quizzes", icon: ClipboardCheck },
  { href: "/flashcards", label: "Flashcards", short: "Cards", icon: Layers },
  { href: "/analytics", label: "Analytics", short: "Analytics", icon: ChartColumn },
  { href: "/achievements", label: "Achievements", short: "Badges", icon: Trophy },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings },
];

/** Bottom navigation on phones: four primary destinations + "More". */
export const MOBILE_PRIMARY = ["/dashboard", "/library", "/planner", "/tutor"];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
