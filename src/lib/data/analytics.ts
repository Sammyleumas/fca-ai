import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AnalyticsSummary } from "@/lib/analytics/insights";

import { RANGES, type RangeKey } from "@/lib/analytics/ranges";

export async function getAnalytics(range: RangeKey): Promise<AnalyticsSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("analytics_summary", { p_days: RANGES[range] });
  if (error || !data) throw new Error("Could not load your analytics.");
  return data as AnalyticsSummary;
}

export type MonthReport = {
  from: string;
  to: string;
  minutes: number;
  active_days: number;
  tasks_completed: number;
  sessions_completed: number;
  flashcard_reviews: number;
  xp: number;
  quizzes: number;
  avg_quiz: number | null;
  achievements: string[];
  daily: { date: string; minutes: number }[];
};

export async function getMonthReport(month: string): Promise<MonthReport> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("analytics_month", { p_month: `${month}-01` });
  if (error || !data) throw new Error("Could not load this report.");
  return data as MonthReport;
}

