import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, BookOpenText, CalendarCheck, CheckCircle2, ClipboardCheck, Clock, FileBarChart, Flame, Lightbulb, Target, TrendingUp } from "lucide-react";
import { ActivityHeatmap, ChartTable, ColumnChart, LineChart } from "@/components/analytics/charts";
import { EmptyState } from "@/components/ui/feedback";
import { CardHeader, GlassCard } from "@/components/ui/glass-card";
import { ProgressBar } from "@/components/ui/progress";
import { buildInsights, percentChange, subjectScores, weeklyChallenges } from "@/lib/analytics/insights";
import { RANGES, weekly, type RangeKey } from "@/lib/analytics/ranges";
import type { AnalyticsSummary } from "@/lib/analytics/insights";
import { clampPercent, cn, formatHours, formatMinutes } from "@/lib/utils/format";


const LABEL: Record<RangeKey, string> = { "7d": "7D", "30d": "30D", "90d": "3M", "1y": "1Y" };
const fmtDay = (d: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
const fmtWeekday = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "narrow", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

export function AnalyticsView({ s, range }: { s: AnalyticsSummary; range: RangeKey }) {
  const t = s.totals;
  const hours = formatHours(t.minutes);
  const change = percentChange(t.minutes, t.prev_minutes);
  const consistency = Math.round((t.active_days / s.days) * 100);
  const columns =
    s.days > 60
      ? weekly(s.daily).map((w) => ({ ...w, tick: fmtDay(w.key) }))
      : s.daily.map((d, i) => ({ key: d.date, label: fmtDay(d.date), value: d.minutes, tick: s.days <= 7 ? fmtWeekday(d.date) : i % 5 === 0 ? fmtDay(d.date) : "" }));
  const insights = buildInsights(s);
  const subjects = subjectScores(s.materials);
  const challenges = weeklyChallenges(s.week);
  const weak = s.topics.filter((x) => Number(x.percent) < 60).slice(0, 6);
  const empty = !t.all_time_minutes && !s.quiz_trend.length;
  const month = s.today.slice(0, 7);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-fg-2">Calculated only from your real study activity.</p>
        </div>
        <nav aria-label="Time range" className="glass flex gap-1 rounded-full p-1">
          {(Object.keys(RANGES) as RangeKey[]).map((k) => (
            <Link key={k} href={`/analytics?range=${k}`} aria-current={k === range ? "page" : undefined} className={cn("focus-ring rounded-full px-3.5 py-1.5 text-xs font-semibold", k === range ? "bg-accent text-[#0b0c0b]" : "text-fg-2 hover:text-fg")}>
              {LABEL[k]}
            </Link>
          ))}
        </nav>
      </div>

      {empty ? (
        <GlassCard>
          <EmptyState icon={<TrendingUp className="size-6" />} title="No activity yet" description="Complete study tasks, read in the Reading Room or take a quiz — your analytics build up from there." />
        </GlassCard>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { icon: Clock, label: "Study time", value: `${hours.value}${hours.unit}`, sub: change === null ? `${LABEL[range]} total` : `${change >= 0 ? "+" : ""}${change}% vs previous`, up: change !== null ? change >= 0 : null },
              { icon: CalendarCheck, label: "Active days", value: `${t.active_days}/${s.days}`, sub: `${consistency}% consistency` },
              { icon: ClipboardCheck, label: "Quizzes", value: String(t.quizzes_completed), sub: t.avg_quiz === null ? "No quizzes yet" : `${Math.round(Number(t.avg_quiz))}% average` },
              { icon: BookOpenText, label: "Materials completed", value: `${t.materials_completed}/${t.materials_total}`, sub: `${Math.round(Number(t.overall_progress))}% overall progress` },
            ].map(({ icon: Icon, label, value, sub, up }) => (
              <GlassCard key={label} className="p-4">
                <dt className="flex items-center gap-2 text-xs text-fg-2"><Icon className="size-4 text-accent" aria-hidden="true" /> {label}</dt>
                <dd className="mt-2 text-2xl font-semibold tracking-tight">{value}</dd>
                <dd className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                  {up === true && <ArrowUpRight className="size-3.5 text-success" aria-hidden="true" />}
                  {up === false && <ArrowDownRight className="size-3.5 text-warning" aria-hidden="true" />}
                  {sub}
                </dd>
              </GlassCard>
            ))}
          </dl>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <GlassCard className="p-5">
              <CardHeader icon={<Clock className="size-5" />} title="Study time" />
              <p className="mt-1 text-xs text-fg-2">Minutes per {s.days > 60 ? "week" : "day"} · {formatMinutes(t.minutes)} in total</p>
              <div className="mt-3"><ColumnChart data={columns} unit="m" label={`Study minutes per ${s.days > 60 ? "week" : "day"}`} /></div>
              <ChartTable caption="Study minutes" headers={[s.days > 60 ? "Week" : "Day", "Minutes"]} rows={columns.map((c) => [c.label, String(c.value)])} />
            </GlassCard>
            <GlassCard className="p-5">
              <CardHeader icon={<TrendingUp className="size-5" />} title="Quiz performance" />
              <p className="mt-1 text-xs text-fg-2">Score per attempt</p>
              {s.quiz_trend.length ? (
                <>
                  <div className="mt-3">
                    <LineChart data={s.quiz_trend.map((q, i) => ({ key: `${i}`, label: `${q.title} · ${fmtDay(q.date)}`, value: Number(q.percent) }))} label="Quiz scores over time" />
                  </div>
                  <ChartTable caption="Quiz scores" headers={["Quiz", "Score"]} rows={s.quiz_trend.map((q) => [`${q.title} (${fmtDay(q.date)})`, `${Math.round(Number(q.percent))}%`])} />
                </>
              ) : (
                <EmptyState icon={<ClipboardCheck className="size-6" />} title="No quizzes in this period" description="Take a quiz to track your performance." className="py-8" />
              )}
            </GlassCard>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <GlassCard className="p-5 lg:col-span-2">
              <CardHeader icon={<Target className="size-5" />} title="Subject performance" />
              {subjects.length ? (
                <ul className="mt-4 space-y-3.5">
                  {subjects.map((x) => (
                    <li key={x.name}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{x.name}</span>
                        <span className="shrink-0 text-xs text-fg-2">
                          {formatMinutes(x.minutes)} · {Number.isFinite(x.quizAvg) ? <span className="font-semibold text-fg">{x.quizAvg}%</span> : "no quizzes"}
                        </span>
                      </div>
                      <ProgressBar value={Number.isFinite(x.quizAvg) ? x.quizAvg : 0} label={`${x.name} average quiz score`} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-fg-2">Assign materials to subjects in your library to compare them here.</p>
              )}
            </GlassCard>
            <GlassCard className="p-5">
              <CardHeader icon={<Flame className="size-5 text-[#ff8a3d]" />} title="Consistency" />
              <p className="mt-1 text-xs text-fg-2">
                Streak {s.streak?.current ?? 0} · longest {s.streak?.longest ?? 0} · last 12 weeks
              </p>
              <div className="mt-4"><ActivityHeatmap days={s.heatmap} label="Study minutes per day over the last 12 weeks" /></div>
            </GlassCard>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <GlassCard className="p-5 lg:col-span-2">
              <CardHeader icon={<Lightbulb className="size-5" />} title="Recommendations" />
              <ul className="mt-3 space-y-2">
                {insights.map((i) => (
                  <li key={i.text} className={cn("rounded-2xl border p-3 text-sm", i.tone === "focus" ? "border-warning/30 bg-warning/5" : i.tone === "positive" ? "border-accent/30 bg-accent/5" : "border-line bg-white/[0.03]")}>
                    {i.href ? <Link href={i.href} className="hover:underline">{i.text}</Link> : i.text}
                  </li>
                ))}
              </ul>
              {weak.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-fg-2">Weak areas</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {weak.map((w) => (
                      <li key={w.topic} className="rounded-full border border-error/30 bg-error/10 px-3 py-1 text-xs">{w.topic} · {Math.round(Number(w.percent))}%</li>
                    ))}
                  </ul>
                </div>
              )}
            </GlassCard>
            <GlassCard className="p-5">
              <CardHeader icon={<CheckCircle2 className="size-5" />} title="This week" action={<Link href="/settings#learning" className="text-xs text-accent hover:underline">Edit goal</Link>} />
              <ul className="mt-3 space-y-3">
                {challenges.map((c) => (
                  <li key={c.id}>
                    <div className="mb-1 flex justify-between gap-2 text-sm">
                      <span>{c.title}</span>
                      <span className="shrink-0 text-xs text-fg-2">{c.progress}/{c.target}</span>
                    </div>
                    <ProgressBar value={(c.progress / c.target) * 100} label={c.title} />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-muted">Goals are about steady habits — rest days are part of learning.</p>
            </GlassCard>
          </div>

          <Link href={`/analytics/report?month=${month}`} className="focus-ring glass flex items-center gap-3 rounded-2xl p-4 hover:border-accent/40">
            <FileBarChart className="size-5 text-accent" aria-hidden="true" />
            <span className="flex-1 text-sm font-semibold">Monthly performance reports</span>
            <span className="text-sm text-accent">Open →</span>
          </Link>
          <p className="text-xs text-muted">
            Reading time counts only while the Reading Room is open and you&apos;re active. Overall progress {clampPercent(Number(t.overall_progress))}% is the average reading progress across your ready materials.
          </p>
        </>
      )}
    </div>
  );
}
