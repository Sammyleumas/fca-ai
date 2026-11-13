import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { ChartTable, ColumnChart } from "@/components/analytics/charts";
import { GlassCard } from "@/components/ui/glass-card";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { getMonthReport } from "@/lib/data/analytics";
import { localDateISO } from "@/lib/utils/dates";
import { formatMinutes } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Monthly report" };

function shift(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

export default async function MonthlyReportPage({ searchParams }: PageProps<"/analytics/report">) {
  const { profile } = await requireOnboardedUser();
  const sp = await searchParams;
  const current = localDateISO(profile.timezone).slice(0, 7);
  const month = typeof sp.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) && sp.month <= current ? sp.month : current;
  const r = await getMonthReport(month);
  const title = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  const days = r.daily.length;
  const best = r.daily.reduce((b, d) => (d.minutes > b.minutes ? d : b), r.daily[0] ?? { date: "", minutes: 0 });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/analytics" className="focus-ring inline-flex items-center gap-2 rounded-full text-sm text-fg-2 hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Analytics
      </Link>
      <div className="flex items-center justify-between gap-3">
        <Link href={`/analytics/report?month=${shift(month, -1)}`} className="focus-ring glass flex size-10 items-center justify-center rounded-full" aria-label="Previous month"><ChevronLeft className="size-5" /></Link>
        <h1 className="text-center text-2xl font-semibold tracking-tight">{title} report</h1>
        {month < current ? (
          <Link href={`/analytics/report?month=${shift(month, 1)}`} className="focus-ring glass flex size-10 items-center justify-center rounded-full" aria-label="Next month"><ChevronRight className="size-5" /></Link>
        ) : (
          <span className="size-10" />
        )}
      </div>
      <GlassCard className="p-6">
        {r.minutes === 0 && r.quizzes === 0 ? (
          <p className="text-center text-fg-2">No study activity was recorded in {title}.</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ["Study time", formatMinutes(r.minutes)],
                ["Active days", `${r.active_days} of ${days}`],
                ["Tasks done", String(r.tasks_completed)],
                ["Sessions done", String(r.sessions_completed)],
                ["Quizzes", String(r.quizzes)],
                ["Average score", r.avg_quiz === null ? "—" : `${Math.round(Number(r.avg_quiz))}%`],
                ["Flashcard reviews", String(r.flashcard_reviews)],
                ["XP earned", String(r.xp)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="text-xl font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6">
              <ColumnChart
                data={r.daily.map((d, i) => ({ key: d.date, label: d.date, value: d.minutes, tick: i % 5 === 0 ? String(Number(d.date.slice(8))) : "" }))}
                unit="m"
                label={`Study minutes per day in ${title}`}
              />
              <ChartTable caption={`${title} study minutes`} headers={["Day", "Minutes"]} rows={r.daily.map((d) => [d.date, String(d.minutes)])} />
            </div>
            <ul className="mt-6 list-disc space-y-1 pl-5 text-sm text-fg-2">
              {best.minutes > 0 && <li>Your most focused day was {best.date} with {formatMinutes(best.minutes)}.</li>}
              <li>You studied on {Math.round((r.active_days / days) * 100)}% of days.</li>
              {r.achievements.length > 0 && <li>Achievements unlocked: {r.achievements.join(", ")}.</li>}
            </ul>
          </>
        )}
      </GlassCard>
    </div>
  );
}
