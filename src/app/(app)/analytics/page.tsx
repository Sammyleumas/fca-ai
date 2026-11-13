import type { Metadata } from "next";
import { AnalyticsView } from "@/components/analytics/analytics-view";
import { RANGES, type RangeKey } from "@/lib/analytics/ranges";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { getAnalytics } from "@/lib/data/analytics";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  await requireOnboardedUser();
  const sp = await searchParams;
  const range: RangeKey = typeof sp.range === "string" && sp.range in RANGES ? (sp.range as RangeKey) : "7d";
  return <AnalyticsView s={await getAnalytics(range)} range={range} />;
}
