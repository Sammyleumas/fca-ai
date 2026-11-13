import type { DashboardData } from "@/lib/data/dashboard";
import { effectiveStreak } from "@/lib/utils/dates";
import { FormMessage } from "@/components/ui/feedback";
import { AssistantCard } from "./assistant-card";
import {
  AchievementsCard,
  HeroCard,
  LibraryCard,
  MissionCard,
  OverviewCard,
  PremiumCard,
  QuickActionsCard,
  QuickActionsGrid,
  StreakCard,
  UpcomingCard,
} from "./cards";

/**
 * Presentational dashboard. Mobile is a single prioritised stack (mission first);
 * from xl it becomes the two-column layout of the desktop design. The `contents`
 * wrappers let `order` interleave both columns on small screens.
 */
export function DashboardView({
  data,
  name,
  greeting,
  dailyGoal,
  plan,
  notice,
}: {
  data: DashboardData;
  name: string;
  greeting: string;
  dailyGoal: number;
  plan: "free" | "premium";
  notice?: string;
}) {
  const { stats, mission, upcoming, recent, achievements } = data;
  const streak = effectiveStreak(stats.streak, stats.today);
  const nextTask = mission.find((t) => t.status !== "completed");
  const continueHref = nextTask?.material
    ? `/reader/${nextTask.material.id}?task=${nextTask.id}`
    : recent[0]?.status === "ready"
      ? `/reader/${recent[0].id}`
      : stats.materials_total > 0
        ? "/planner/new"
        : "/library?upload=1";
  const continueLabel = nextTask || recent[0]?.status === "ready" ? "Continue Learning" : stats.materials_total > 0 ? "Create Study Plan" : "Upload Material";

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      {notice && <FormMessage tone="success">{notice}</FormMessage>}
      <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(340px,380px)] xl:items-start">
        <div className="contents xl:flex xl:flex-col xl:gap-5">
          <div className="order-1 xl:order-none">
            <HeroCard
              greeting={greeting}
              name={name}
              streakDays={streak.days}
              streakAtRisk={streak.atRisk}
              continueHref={continueHref}
              continueLabel={continueLabel}
            />
          </div>
          <div className="order-3 xl:order-none">
            <MissionCard
              tasks={mission}
              done={stats.tasks_today_done}
              total={stats.tasks_today_total}
              todayMinutes={stats.today_minutes}
              dailyGoal={dailyGoal}
              hasMaterials={stats.materials_total > 0}
            />
          </div>
          <div className="order-4 xl:hidden">
            <QuickActionsGrid />
          </div>
          <div className="order-6 xl:order-none">
            <OverviewCard stats={stats} />
          </div>
          <div className="order-7 xl:order-none">
            <LibraryCard materials={recent} />
          </div>
          <div className="order-8 grid gap-5 lg:grid-cols-2 xl:order-none">
            <AssistantCard />
            <QuickActionsCard />
          </div>
        </div>
        <div className="contents xl:flex xl:flex-col xl:gap-5">
          <div className="order-2 xl:order-none">
            <StreakCard days={streak.days} longest={stats.streak?.longest_streak ?? 0} activeToday={streak.activeToday} week={stats.week} />
          </div>
          <div className="order-5 xl:order-none">
            <UpcomingCard sessions={upcoming} today={stats.today} />
          </div>
          <div className="order-9 xl:order-none">
            <AchievementsCard achievements={achievements} />
          </div>
          {plan === "free" && (
            <div className="order-10 xl:order-none">
              <PremiumCard />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
