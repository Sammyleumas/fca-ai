import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Clock,
  Crown,
  Flame,
  FolderOpen,
  Layers,
  Play,
  Plus,
  Trophy,
  Upload,
  Zap,
} from "lucide-react";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { CardHeader, GlassCard } from "@/components/ui/glass-card";
import { EmptyState } from "@/components/ui/feedback";
import { FileBadge } from "@/components/ui/file-badge";
import { ProgressBar, ProgressRing } from "@/components/ui/progress";
import { AchievementBadge } from "@/components/ui/achievement-badge";
import { SilkBackground } from "@/components/brand/silk-background";
import type {
  DashboardAchievement,
  DashboardStats,
  MissionTask,
  RecentMaterial,
  UpcomingSession,
} from "@/lib/data/dashboard";
import { dayOfMonth, monthShort, relativeDayLabel, weekdayShort } from "@/lib/utils/dates";
import { clampPercent, cn, formatHours, formatMinutes } from "@/lib/utils/format";

function ViewLink({ href, children = "View all" }: { href: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className="focus-ring inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded text-sm font-medium text-accent hover:underline">
      {children} <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}

/* ------------------------------------------------------------------ Hero */
export function HeroCard({
  greeting,
  name,
  streakDays,
  streakAtRisk,
  continueHref,
  continueLabel,
}: {
  greeting: string;
  name: string;
  streakDays: number;
  streakAtRisk: boolean;
  continueHref: string;
  continueLabel: string;
}) {
  const sub =
    streakDays > 0
      ? streakAtRisk
        ? `You're on a ${streakDays}-day streak — study today to keep it alive.`
        : `Keep going. You're on a ${streakDays}-day streak!`
      : "Complete a study task today to start your streak.";
  return (
    <GlassCard className="overflow-hidden p-6 sm:p-8">
      <SilkBackground variant="card" />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[2rem] font-semibold leading-tight tracking-tight sm:text-4xl">
            {greeting},
            <br className="sm:hidden" /> <span className="text-accent">{name}!</span>{" "}
            <span aria-hidden="true">👋</span>
          </h1>
          <p className="mt-3 flex items-center gap-2 text-fg-2 sm:text-lg">
            <Flame className="size-5 shrink-0 text-[#ff8a3d]" aria-hidden="true" />
            {sub}
          </p>
          <ButtonLink href={continueHref} className="mt-6" size="lg">
            {continueLabel} <ArrowRight className="size-4" aria-hidden="true" />
          </ButtonLink>
        </div>
        <blockquote className="hidden max-w-[220px] text-right text-lg font-medium leading-snug text-fg/90 xl:block">
          <span className="text-accent">“</span>Small steps every day lead to big results.<span className="text-accent">”</span>
        </blockquote>
      </div>
    </GlassCard>
  );
}

/* --------------------------------------------------------------- Streak */
export function StreakCard({
  days,
  longest,
  activeToday,
  week,
}: {
  days: number;
  longest: number;
  activeToday: boolean;
  week: DashboardStats["week"];
}) {
  const max = Math.max(30, ...week.map((w) => w.minutes));
  return (
    <GlassCard className="overflow-hidden p-6">
      <SilkBackground variant="card" />
      <div className="relative">
        <CardHeader icon={<Flame className="size-5 text-[#ff8a3d]" />} title="Your Study Streak" />
        <div className="mt-4 flex items-end gap-2">
          <span className="text-6xl font-semibold leading-none tracking-tight">{days}</span>
          <span className="pb-1 text-xl font-semibold text-accent">{days === 1 ? "Day" : "Days"}</span>
        </div>
        <p className="mt-2 text-sm text-fg-2">
          {activeToday ? "Today counts — nice work." : days > 0 ? "Keep the streak alive today." : "Finish a study task to begin."}{" "}
          <span className="text-muted">Longest: {longest}</span>
        </p>
        <figure className="mt-5" aria-label="Study minutes over the last 7 days">
          <div className="flex h-28 items-end justify-between gap-2">
            {week.map((w) => {
              const h = w.minutes > 0 ? Math.max(10, Math.round((w.minutes / max) * 100)) : 6;
              return (
                <div key={w.date} className="flex h-full flex-1 flex-col items-center justify-end">
                  <div
                    className={cn(
                      "w-full max-w-4 rounded-full transition-[height] duration-700",
                      w.qualified
                        ? "bg-gradient-to-t from-[#ffd600] to-accent shadow-[0_0_14px_rgba(255,235,59,0.55)]"
                        : w.minutes > 0
                          ? "bg-accent/40"
                          : "bg-white/10",
                    )}
                    style={{ height: `${h}%` }}
                    title={`${weekdayShort(w.date)}: ${formatMinutes(w.minutes)}`}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between gap-2 text-[11px] text-fg-2">
            {week.map((w) => (
              <span key={w.date} className="flex-1 text-center">
                {weekdayShort(w.date)}
              </span>
            ))}
          </div>
          <figcaption className="sr-only">
            {week.map((w) => `${weekdayShort(w.date)} ${w.minutes} minutes`).join(", ")}
          </figcaption>
        </figure>
      </div>
    </GlassCard>
  );
}

/* -------------------------------------------------------------- Mission */
export function MissionCard({
  tasks,
  done,
  total,
  todayMinutes,
  dailyGoal,
  hasMaterials,
}: {
  tasks: MissionTask[];
  done: number;
  total: number;
  todayMinutes: number;
  dailyGoal: number;
  hasMaterials: boolean;
}) {
  const next = tasks.find((t) => t.status !== "completed");
  const dayPct = total > 0 ? (done / total) * 100 : Math.min(100, (todayMinutes / dailyGoal) * 100);
  return (
    <GlassCard className="p-5 sm:p-6">
      <CardHeader icon={<Zap className="size-5" />} title="Today's Mission" action={<ViewLink href="/planner" />} />
      {next ? (
        <div className="mt-4 flex items-center gap-4 rounded-2xl border border-line bg-white/[0.03] p-4">
          {next.material && <FileBadge type={next.material.file_type} size={46} />}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{next.material?.title ?? next.title}</p>
            <p className="mt-0.5 text-sm text-fg-2">
              {next.start_page ? `Pages ${next.start_page} – ${next.end_page ?? next.start_page}` : next.title}
              {next.estimated_minutes ? ` · ${formatMinutes(next.estimated_minutes)}` : ""}
            </p>
            <ButtonLink
              href={`/planner/sessions/${next.sessionId}`}
              size="sm"
              className="mt-3"
            >
              Start session <Play className="size-3.5 fill-current" aria-hidden="true" />
            </ButtonLink>
          </div>
          <ProgressRing value={next.materialProgress} size={76} label={`${clampPercent(next.materialProgress)}% of this material read`} />
        </div>
      ) : total > 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="size-6" />}
          title="Mission complete!"
          description="Every task planned for today is done. Take a break or revise with flashcards."
          action={<ButtonLink href="/flashcards" variant="secondary" size="sm">Revise flashcards</ButtonLink>}
          className="py-6"
        />
      ) : (
        <EmptyState
          icon={<CalendarDays className="size-6" />}
          title="Nothing scheduled for today"
          description={
            hasMaterials
              ? "Create a study plan and FCA-AI will assign daily sections from your materials."
              : "Upload your first learning material, then FCA-AI can build your daily plan."
          }
          action={
            <ButtonLink href={hasMaterials ? "/planner/new" : "/library?upload=1"} size="sm">
              {hasMaterials ? "Create study plan" : "Upload material"} <ArrowRight className="size-3.5" />
            </ButtonLink>
          }
          className="py-6"
        />
      )}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-xs text-fg-2">
          <span>{total > 0 ? `Daily progress · ${done}/${total} tasks` : "Daily study time"}</span>
          <span>
            {formatMinutes(todayMinutes)} / {formatMinutes(dailyGoal)}
          </span>
        </div>
        <ProgressBar value={dayPct} label="Daily study progress" />
      </div>
    </GlassCard>
  );
}

/* -------------------------------------------------------- Quick actions */
const QUICK = [
  { href: "/library", label: "My Library", desc: "Your materials", icon: BookOpenText },
  { href: "/planner/new", label: "Create Study Plan", short: "Study Plan", desc: "Let AI organise your study", icon: CalendarDays },
  { href: "/assessments", label: "Start a Quiz", short: "Take Quiz", desc: "Test your knowledge", icon: ClipboardCheck },
  { href: "/flashcards", label: "Generate Flashcards", short: "Flashcards", desc: "Revise smarter", icon: Layers },
  { href: "/assessments?mock=1", label: "Start Mock Exam", short: "Mock Exam", desc: "Be examination ready", icon: Trophy },
  { href: "/achievements", label: "Achievements", short: "Badges", desc: "Your milestones", icon: Trophy },
];

export function QuickActionsGrid() {
  const items = [QUICK[0], QUICK[1], QUICK[2], QUICK[5]];
  return (
    <nav aria-label="Quick actions" className="grid grid-cols-4 gap-2.5 md:hidden">
      {items.map(({ href, label, short, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="focus-ring glass flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl px-1 text-center text-[11px] font-medium text-fg-2 hover:text-fg"
        >
          <Icon className="size-6 text-accent" aria-hidden="true" />
          {short ?? label}
        </Link>
      ))}
    </nav>
  );
}

export function QuickActionsCard() {
  return (
    <GlassCard className="hidden p-6 md:block">
      <CardHeader icon={<Zap className="size-5" />} title="Quick Actions" />
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
        {[QUICK[1], QUICK[2], QUICK[3], QUICK[4]].map(({ href, label, desc, icon: Icon }) => (
          <li key={label}>
            <Link
              href={href}
              className="focus-ring group flex items-center gap-3 rounded-2xl border border-line bg-white/[0.03] p-3.5 transition hover:border-accent/40 hover:bg-white/[0.06]"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block truncate text-xs text-fg-2">{desc}</span>
              </span>
              <ChevronRight className="size-4 text-fg-2 transition group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

/* ------------------------------------------------------------- Overview */
export function OverviewCard({ stats }: { stats: DashboardStats }) {
  const hours = formatHours(stats.total_study_minutes);
  const items = [
    { icon: BookOpenText, value: String(stats.materials_total), unit: "", label: stats.materials_total === 1 ? "Material" : "Materials" },
    { icon: CircleCheck, value: String(clampPercent(Number(stats.overall_completion))), unit: "%", label: "Overall Progress", bar: Number(stats.overall_completion) },
    {
      icon: Trophy,
      value: stats.avg_quiz_score == null ? "—" : String(clampPercent(Number(stats.avg_quiz_score))),
      unit: stats.avg_quiz_score == null ? "" : "%",
      label: stats.avg_quiz_score == null ? "No quizzes yet" : "Avg Quiz Score",
    },
    { icon: Clock, value: hours.value, unit: hours.unit, label: "Study Time" },
  ];
  return (
    <GlassCard className="p-5 sm:p-6">
      <CardHeader icon={<CircleCheck className="size-5" />} title="Your Learning Overview" action={<ViewLink href="/analytics">View details</ViewLink>} />
      <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map(({ icon: Icon, value, unit, label, bar }) => (
          <div key={label} className="rounded-2xl border border-line bg-white/[0.03] p-4">
            <dt className="sr-only">{label}</dt>
            <dd>
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="text-2xl font-semibold tracking-tight">
                  {value}
                  {unit && <span className="ml-0.5 align-super text-xs font-medium text-fg-2">{unit}</span>}
                </span>
              </div>
              <p className="mt-2 text-sm text-fg-2" aria-hidden="true">
                {label}
              </p>
              {bar !== undefined && <ProgressBar value={bar} className="mt-2" label={label} />}
            </dd>
          </div>
        ))}
      </dl>
    </GlassCard>
  );
}

/* ------------------------------------------------------------- Upcoming */
export function UpcomingCard({ sessions, today }: { sessions: UpcomingSession[]; today: string }) {
  return (
    <GlassCard className="p-5 sm:p-6">
      <CardHeader icon={<CalendarDays className="size-5" />} title="Upcoming Plan" action={<ViewLink href="/planner">View calendar</ViewLink>} />
      {sessions.length ? (
        <ul className="mt-4 space-y-2.5">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link
                href={`/planner/sessions/${s.id}`}
                className="focus-ring group flex items-center gap-3.5 rounded-2xl border border-line bg-white/[0.03] p-3 transition hover:border-accent/40"
              >
                <span className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-accent/10 py-1.5 leading-none text-accent">
                  <span className="text-[10px] font-semibold">{monthShort(s.scheduled_date)}</span>
                  <span className="mt-1 text-xl font-semibold">{dayOfMonth(s.scheduled_date)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{s.title}</span>
                  <span className="block text-xs text-fg-2">
                    {relativeDayLabel(s.scheduled_date, today)} · {s.taskCount} {s.taskCount === 1 ? "section" : "sections"} ·{" "}
                    {formatMinutes(s.planned_minutes)}
                  </span>
                </span>
                <span className="flex size-8 items-center justify-center rounded-full border border-line text-fg-2 group-hover:text-accent">
                  <ChevronRight className="size-4" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<CalendarDays className="size-6" />}
          title="No upcoming sessions"
          description="Your study plan's sessions will appear here."
          action={<ButtonLink href="/planner/new" size="sm" variant="secondary">Create a plan</ButtonLink>}
          className="py-6"
        />
      )}
    </GlassCard>
  );
}

/* -------------------------------------------------------------- Library */
const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  queued: "Queued",
  extracting: "Extracting…",
  analysing: "Analysing…",
  structuring: "Structuring…",
  failed: "Processing failed",
};

export function LibraryCard({ materials }: { materials: RecentMaterial[] }) {
  return (
    <GlassCard className="p-5 sm:p-6">
      <CardHeader icon={<FolderOpen className="size-5" />} title="My Library" action={<ViewLink href="/library" />} />
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {materials.map((m) => (
          <li key={m.id}>
            <Link
              href={`/library/${m.id}`}
              className="focus-ring flex h-full items-center gap-3 rounded-2xl border border-line bg-white/[0.03] p-4 transition hover:border-accent/40 xl:flex-col xl:items-start"
            >
              <FileBadge type={m.file_type} size={36} />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm font-semibold">{m.title}</span>
                <span className="mt-1 block text-xs text-fg-2">
                  {m.status === "ready"
                    ? m.page_count
                      ? `${m.page_count} pages`
                      : "Ready"
                    : STATUS_LABEL[m.status]}
                </span>
                {m.status === "ready" && m.progress > 0 && <ProgressBar value={m.progress} className="mt-2" label={`${m.title} progress`} />}
              </span>
            </Link>
          </li>
        ))}
        <li className={cn(materials.length === 0 && "sm:col-span-2 xl:col-span-5")}>
          <Link
            href="/library?upload=1"
            className="focus-ring flex h-full min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong p-4 text-center text-sm text-fg-2 transition hover:border-accent/60 hover:text-fg"
          >
            {materials.length === 0 ? <Upload className="size-5 text-accent" /> : <Plus className="size-5" />}
            {materials.length === 0 ? "Upload your first material" : "Upload More Materials"}
          </Link>
        </li>
      </ul>
    </GlassCard>
  );
}

/* --------------------------------------------------------- Achievements */
export function AchievementsCard({ achievements }: { achievements: DashboardAchievement[] }) {
  const earned = achievements.filter((a) => a.earned_at).sort((a, b) => (b.earned_at! > a.earned_at! ? 1 : -1));
  const locked = achievements.filter((a) => !a.earned_at);
  const shown = [...earned, ...locked].slice(0, 4);
  return (
    <GlassCard className="p-5 sm:p-6">
      <CardHeader icon={<Trophy className="size-5" />} title="Achievements" action={<ViewLink href="/achievements" />} />
      <p className="mt-1 text-xs text-fg-2">
        {earned.length} of {achievements.length} unlocked
      </p>
      <ul className="mt-4 grid grid-cols-4 gap-2">
        {shown.map((a, i) => (
          <li key={a.id} className="flex flex-col items-center text-center">
            <AchievementBadge icon={a.icon} earned={Boolean(a.earned_at)} index={i} size={56} />
            <span className={cn("mt-2 text-[11px] font-medium leading-tight", a.earned_at ? "text-fg" : "text-muted")}>{a.name}</span>
            <span className={cn("text-[11px] font-semibold", a.earned_at ? "text-accent" : "text-muted")}>+{a.xp} XP</span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

/* -------------------------------------------------------------- Premium */
export function PremiumCard() {
  return (
    <GlassCard className="overflow-hidden p-6">
      <SilkBackground variant="card" />
      <div className="relative flex items-center gap-4">
        <div className="flex-1">
          <h2 className="font-semibold">Unlock Your Potential</h2>
          <p className="mt-1.5 text-sm text-fg-2">Premium brings higher upload limits, an advanced AI tutor and deeper analytics.</p>
          <Link href="/settings/billing" className={buttonClasses({ size: "sm", className: "mt-4" })}>
            See Premium <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
        <Crown className="size-16 shrink-0 text-warning drop-shadow-[0_8px_20px_rgba(245,185,66,0.45)]" aria-hidden="true" />
      </div>
    </GlassCard>
  );
}
