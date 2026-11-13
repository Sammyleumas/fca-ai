import type { Metadata } from "next";
import { Flame, Sparkles, Trophy } from "lucide-react";
import { AchievementBadge } from "@/components/ui/achievement-badge";
import { GlassCard } from "@/components/ui/glass-card";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { effectiveStreak, localDateISO } from "@/lib/utils/dates";
import type { AchievementRow } from "@/types/db";
import { cn } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Achievements" };

export default async function AchievementsPage() {
  const { user, profile } = await requireOnboardedUser();
  const supabase = await createClient();
  const [catalog, earned, streakRes] = await Promise.all([
    supabase.from("achievements").select("id, code, name, description, icon, xp, sort_order").order("sort_order"),
    supabase.from("user_achievements").select("achievement_id, earned_at").eq("user_id", user.id),
    supabase.from("study_streaks").select("current_streak, longest_streak, last_qualifying_date").eq("user_id", user.id).maybeSingle(),
  ]);
  if (catalog.error || earned.error || streakRes.error) throw new Error("Could not load achievements.");

  const earnedMap = new Map((earned.data ?? []).map((e) => [e.achievement_id as string, e.earned_at as string]));
  const items = (catalog.data as AchievementRow[]).map((a) => ({ ...a, earned_at: earnedMap.get(a.id) ?? null }));
  const streak = effectiveStreak(streakRes.data, localDateISO(profile.timezone));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Achievements</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: Flame, label: "Current streak", value: `${streak.days} ${streak.days === 1 ? "day" : "days"}` },
          { icon: Trophy, label: "Longest streak", value: `${streakRes.data?.longest_streak ?? 0} days` },
          { icon: Sparkles, label: "Total XP", value: profile.xp.toLocaleString() },
        ].map(({ icon: Icon, label, value }) => (
          <GlassCard key={label} className="flex items-center gap-4 p-5">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm text-fg-2">{label}</p>
              <p className="text-2xl font-semibold">{value}</p>
            </div>
          </GlassCard>
        ))}
      </div>
      <p className="text-sm text-fg-2">
        Streaks grow only when you complete a study task, session or assessment — opening the app doesn&apos;t count. XP is
        capped each day so steady study beats marathon sessions.
      </p>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((a, i) => (
          <li key={a.id}>
            <GlassCard as="article" className={cn("flex h-full items-center gap-4 p-5", !a.earned_at && "opacity-70")}>
              <AchievementBadge icon={a.icon} earned={Boolean(a.earned_at)} index={i} size={60} />
              <div className="min-w-0">
                <h2 className="font-semibold">{a.name}</h2>
                <p className="text-sm text-fg-2">{a.description}</p>
                <p className={cn("mt-1 text-xs font-semibold", a.earned_at ? "text-accent" : "text-muted")}>
                  {a.earned_at
                    ? `Unlocked ${new Date(a.earned_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: profile.timezone })} · +${a.xp} XP`
                    : `Locked · +${a.xp} XP`}
                </p>
              </div>
            </GlassCard>
          </li>
        ))}
      </ul>
    </div>
  );
}
