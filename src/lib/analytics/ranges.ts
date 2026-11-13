export const RANGES = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 } as const;
export type RangeKey = keyof typeof RANGES;

/** Weekly buckets for long ranges (Monday-start weeks). */
export function weekly(daily: { date: string; minutes: number }[]): { key: string; label: string; value: number }[] {
  const out = new Map<string, number>();
  for (const d of daily) {
    const dt = new Date(`${d.date}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
    const k = dt.toISOString().slice(0, 10);
    out.set(k, (out.get(k) ?? 0) + d.minutes);
  }
  return [...out.entries()].map(([k, v]) => ({ key: k, label: `Week of ${k}`, value: v }));
}
