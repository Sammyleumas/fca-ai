"use client";

import { useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils/format";

/*
 * Single-series charts in the MindFlow palette. Marks use the brand lime (≥ 3:1
 * contrast on the dark surface); all text uses text tokens. Every chart has a
 * hover layer and an accessible table view.
 */
const MARK = "#D6FF35";
const GRID = "rgba(255,255,255,0.08)";

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

type Tip = { x: number; y: number; title: string; value: string } | null;

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl border border-line-strong bg-[#141615] px-3 py-2 text-xs shadow-xl"
      style={{ left: tip.x, top: tip.y - 10 }}
      role="status"
    >
      <p className="text-fg-2">{tip.title}</p>
      <p className="font-semibold text-fg">{tip.value}</p>
    </div>
  );
}

export function ChartTable({ caption, headers, rows }: { caption: string; headers: [string, string]; rows: [string, string][] }) {
  return (
    <details className="mt-3 text-xs text-fg-2">
      <summary className="focus-ring w-fit cursor-pointer rounded hover:text-fg">View as table</summary>
      <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-line">
        <table className="w-full text-left">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-bg-2">
            <tr>
              <th className="px-3 py-1.5 font-medium">{headers[0]}</th>
              <th className="px-3 py-1.5 text-right font-medium">{headers[1]}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([a, b], i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-3 py-1.5">{a}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-fg">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Column chart (e.g. minutes per day). */
export function ColumnChart({
  data,
  unit = "",
  label,
  height = 200,
}: {
  data: { key: string; label: string; tick?: string; value: number }[];
  /** Appended to values (props must be serialisable, so no formatter function). */
  unit?: string;
  label: string;
  height?: number;
}) {
  const format = (v: number) => `${Math.round(v).toLocaleString("en-GB")}${unit}`;
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip>(null);
  const [width, setWidth] = useState(640);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const pad = { l: 36, r: 8, t: 16, b: 24 };
  const plotW = Math.max(100, width - pad.l - pad.r);
  const plotH = height - pad.t - pad.b;
  const band = plotW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(24, band - 2));
  const peak = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0);
  const tickEvery = Math.ceil(data.length / 8);

  return (
    <div
      ref={(el) => {
        wrap.current = el;
        if (el && Math.abs(el.clientWidth - width) > 4) setWidth(el.clientWidth);
      }}
      className="relative"
      onMouseLeave={() => setTip(null)}
    >
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        {[0, 0.5, 1].map((f) => {
          const y = pad.t + plotH * (1 - f);
          return (
            <g key={f}>
              <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
              <text x={pad.l - 6} y={y + 3} textAnchor="end" className="fill-[var(--mf-muted)] text-[10px]">{format(max * f)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = d.value > 0 ? Math.max(2, (d.value / max) * plotH) : 0;
          const x = pad.l + i * band + (band - barW) / 2;
          const y = pad.t + plotH - h;
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={d.key}>
              {h > 0 && (
                <path
                  d={`M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${y + h} Z`}
                  fill={MARK}
                  opacity={tip && tip.title !== d.label ? 0.55 : 1}
                />
              )}
              {i === peak && d.value > 0 && data.length <= 31 && (
                <text x={x + barW / 2} y={y - 5} textAnchor="middle" className="fill-[var(--mf-text)] text-[10px] font-semibold">{format(d.value)}</text>
              )}
              {(d.tick ?? (i % tickEvery === 0 ? d.label : "")) && (
                <text x={x + barW / 2} y={height - 6} textAnchor="middle" className="fill-[var(--mf-muted)] text-[10px]">{d.tick ?? d.label}</text>
              )}
              {/* Hit target: the whole band, taller than the mark. */}
              <rect
                x={pad.l + i * band}
                y={pad.t}
                width={band}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setTip({ x: x + barW / 2, y: Math.min(y, pad.t + plotH - 4), title: d.label, value: format(d.value) })}
              />
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Line chart for percentages over time (e.g. quiz scores). */
export function LineChart({ data, label, height = 200 }: { data: { key: string; label: string; value: number }[]; label: string; height?: number }) {
  const [tip, setTip] = useState<(Tip & { i: number }) | null>(null);
  const [width, setWidth] = useState(640);
  const pad = { l: 36, r: 16, t: 16, b: 24 };
  const plotW = Math.max(100, width - pad.l - pad.r);
  const plotH = height - pad.t - pad.b;
  const pts = data.map((d, i) => ({
    ...d,
    x: pad.l + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW),
    y: pad.t + plotH * (1 - Math.min(100, Math.max(0, d.value)) / 100),
  }));
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  const gid = useId().replace(/:/g, "");

  return (
    <div
      ref={(el) => {
        if (el && Math.abs(el.clientWidth - width) > 4) setWidth(el.clientWidth);
      }}
      className="relative"
      onMouseLeave={() => setTip(null)}
      onMouseMove={(e) => {
        if (!pts.length) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const mx = ((e.clientX - rect.left) / rect.width) * width;
        let best = 0;
        pts.forEach((p, i) => {
          if (Math.abs(p.x - mx) < Math.abs(pts[best].x - mx)) best = i;
        });
        const p = pts[best];
        setTip({ i: best, x: (p.x / width) * rect.width, y: (p.y / height) * rect.height, title: p.label, value: `${Math.round(p.value)}%` });
      }}
    >
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={MARK} stopOpacity="0.12" />
            <stop offset="1" stopColor={MARK} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 50, 100].map((v) => {
          const y = pad.t + plotH * (1 - v / 100);
          return (
            <g key={v}>
              <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
              <text x={pad.l - 6} y={y + 3} textAnchor="end" className="fill-[var(--mf-muted)] text-[10px]">{v}%</text>
            </g>
          );
        })}
        {pts.length > 1 && <path d={`${path} L${pts.at(-1)!.x},${pad.t + plotH} L${pts[0].x},${pad.t + plotH} Z`} fill={`url(#${gid})`} />}
        {pts.length > 1 && <path d={path} fill="none" stroke={MARK} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {tip && <line x1={pts[tip.i].x} x2={pts[tip.i].x} y1={pad.t} y2={pad.t + plotH} stroke="rgba(255,255,255,0.25)" strokeWidth={1} />}
        {pts.map((p, i) => (
          <circle key={p.key} cx={p.x} cy={p.y} r={tip?.i === i ? 5 : 4} fill={MARK} stroke="var(--mf-bg-2)" strokeWidth={2} />
        ))}
        {pts.length > 0 && (
          <text x={pts.at(-1)!.x} y={pts.at(-1)!.y - 10} textAnchor="end" className="fill-[var(--mf-text)] text-[10px] font-semibold">
            {Math.round(pts.at(-1)!.value)}%
          </text>
        )}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/** 12-week activity calendar (sequential: one hue, darker → brighter = more minutes). */
export function ActivityHeatmap({ days, label }: { days: { date: string; minutes: number }[]; label: string }) {
  const [tip, setTip] = useState<Tip>(null);
  const steps = [0.07, 0.25, 0.45, 0.7, 1];
  const level = (m: number) => (m <= 0 ? 0 : m < 15 ? 1 : m < 45 ? 2 : m < 90 ? 3 : 4);
  const cols = useMemo(() => {
    // Align to weeks starting Monday.
    const first = days[0] ? (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;
    const cells: ({ date: string; minutes: number } | null)[] = [...Array(first).fill(null), ...days];
    const out: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [days]);
  const fmt = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  return (
    <div className="relative" onMouseLeave={() => setTip(null)}>
      <div className="flex gap-[3px] overflow-x-auto pb-1" role="img" aria-label={label}>
        {cols.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {col.map((c, ri) =>
              c ? (
                <span
                  key={c.date}
                  className="size-3.5 rounded-[3px] sm:size-4"
                  style={{ background: level(c.minutes) ? MARK : "rgba(255,255,255,0.06)", opacity: level(c.minutes) ? steps[level(c.minutes)] : 1 }}
                  onMouseEnter={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const parent = e.currentTarget.closest(".relative")!.getBoundingClientRect();
                    setTip({ x: r.left - parent.left + r.width / 2, y: r.top - parent.top, title: fmt(c.date), value: `${c.minutes} min` });
                  }}
                />
              ) : (
                <span key={`e${ri}`} className="size-3.5 sm:size-4" />
              ),
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted" aria-hidden="true">
        Less
        {steps.map((o, i) => (
          <span key={i} className={cn("size-3 rounded-[3px]")} style={{ background: i ? MARK : "rgba(255,255,255,0.06)", opacity: i ? o : 1 }} />
        ))}
        More
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}
