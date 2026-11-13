/** Time-zone aware date helpers. All "dates" are ISO yyyy-mm-dd strings in the student's zone. */

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function safeTimeZone(tz: string | null | undefined): string {
  return tz && isValidTimeZone(tz) ? tz : "UTC";
}

/** Local calendar date (yyyy-mm-dd) for `at` in time zone `tz`. */
export function localDateISO(tz: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function localHour(tz: string, at: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: safeTimeZone(tz), hour: "2-digit", hourCycle: "h23" }).format(at);
  return Number(h);
}

/** Adds whole days to an ISO date (calendar arithmetic, DST-safe). */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Inclusive list of the last `n` local dates ending today, oldest first. */
export function lastNDates(todayISO: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDaysISO(todayISO, i - (n - 1)));
}

export function weekdayShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function monthShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d))).toUpperCase();
}

export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

export function greetingFor(tz: string, at: Date = new Date()): "Good morning" | "Good afternoon" | "Good evening" {
  const h = localHour(tz, at);
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * The stored streak only changes when a qualifying activity is recorded. If the
 * last qualifying day is before yesterday the streak is broken and shows as 0.
 */
export function effectiveStreak(
  streak: { current_streak: number; last_qualifying_date: string | null } | null,
  todayISO: string,
): { days: number; activeToday: boolean; atRisk: boolean } {
  if (!streak?.last_qualifying_date || streak.current_streak <= 0) {
    return { days: 0, activeToday: false, atRisk: false };
  }
  const last = streak.last_qualifying_date;
  if (last === todayISO) return { days: streak.current_streak, activeToday: true, atRisk: false };
  if (last === addDaysISO(todayISO, -1)) return { days: streak.current_streak, activeToday: false, atRisk: true };
  return { days: 0, activeToday: false, atRisk: false };
}

export function relativeDayLabel(iso: string, todayISO: string): string {
  if (iso === todayISO) return "Today";
  if (iso === addDaysISO(todayISO, 1)) return "Tomorrow";
  if (iso === addDaysISO(todayISO, -1)) return "Yesterday";
  return `${weekdayShort(iso)} ${dayOfMonth(iso)} ${monthShort(iso).charAt(0)}${monthShort(iso).slice(1).toLowerCase()}`;
}
