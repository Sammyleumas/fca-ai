import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  effectiveStreak,
  greetingFor,
  lastNDates,
  localDateISO,
  relativeDayLabel,
  safeTimeZone,
} from "@/lib/utils/dates";

describe("date helpers", () => {
  it("computes the local date in a time zone", () => {
    const at = new Date("2026-11-13T23:30:00Z");
    expect(localDateISO("UTC", at)).toBe("2026-11-13");
    expect(localDateISO("Africa/Lagos", at)).toBe("2026-11-14");
    expect(localDateISO("America/Los_Angeles", at)).toBe("2026-11-13");
  });

  it("falls back to UTC for invalid zones", () => {
    expect(safeTimeZone("Not/AZone")).toBe("UTC");
    expect(safeTimeZone(null)).toBe("UTC");
  });

  it("adds days across month and DST boundaries", () => {
    expect(addDaysISO("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDaysISO("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDaysISO("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("lists the last n dates oldest first", () => {
    expect(lastNDates("2026-11-13", 3)).toEqual(["2026-11-11", "2026-11-12", "2026-11-13"]);
  });

  it("greets by local time of day", () => {
    expect(greetingFor("UTC", new Date("2026-11-13T08:00:00Z"))).toBe("Good morning");
    expect(greetingFor("UTC", new Date("2026-11-13T13:00:00Z"))).toBe("Good afternoon");
    expect(greetingFor("UTC", new Date("2026-11-13T21:00:00Z"))).toBe("Good evening");
    expect(greetingFor("Africa/Lagos", new Date("2026-11-13T23:30:00Z"))).toBe("Good evening");
  });

  it("only shows a live streak when the last qualifying day is today or yesterday", () => {
    const today = "2026-11-13";
    expect(effectiveStreak({ current_streak: 7, last_qualifying_date: today }, today)).toEqual({
      days: 7,
      activeToday: true,
      atRisk: false,
    });
    expect(effectiveStreak({ current_streak: 7, last_qualifying_date: "2026-11-12" }, today)).toEqual({
      days: 7,
      activeToday: false,
      atRisk: true,
    });
    expect(effectiveStreak({ current_streak: 7, last_qualifying_date: "2026-11-10" }, today).days).toBe(0);
    expect(effectiveStreak(null, today).days).toBe(0);
  });

  it("labels relative days", () => {
    expect(relativeDayLabel("2026-11-13", "2026-11-13")).toBe("Today");
    expect(relativeDayLabel("2026-11-14", "2026-11-13")).toBe("Tomorrow");
    expect(relativeDayLabel("2026-11-20", "2026-11-13")).toBe("Fri 20 Nov");
  });
});
