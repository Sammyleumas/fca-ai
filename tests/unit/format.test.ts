import { describe, expect, it } from "vitest";
import { clampPercent, formatBytes, formatHours, formatMinutes } from "@/lib/utils/format";
import { safeNextPath } from "@/lib/routes";

describe("formatting", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(2_516_582)).toBe("2.4 MB");
    expect(formatBytes(839_680)).toBe("820 KB");
  });
  it("formats minutes", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(135)).toBe("2h 15m");
    expect(formatMinutes(120)).toBe("2h");
  });
  it("formats hours", () => {
    expect(formatHours(30)).toEqual({ value: "30", unit: "m" });
    expect(formatHours(90)).toEqual({ value: "1.5", unit: "h" });
    expect(formatHours(720)).toEqual({ value: "12", unit: "h" });
  });
  it("clamps percentages", () => {
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(-3)).toBe(0);
    expect(clampPercent(null)).toBe(0);
    expect(clampPercent(67.6)).toBe(68);
  });
});

describe("safeNextPath", () => {
  it("rejects open redirects", () => {
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.com")).toBe("/dashboard");
    expect(safeNextPath("/library?x=1")).toBe("/library?x=1");
    expect(safeNextPath(null)).toBe("/dashboard");
  });
});
