import { describe, expect, it } from "vitest";
import { normaliseUnits, planWindows, type AnalysisWindow } from "@/lib/materials/segmentation";

const w: AnalysisWindow = { startPage: 10, endPage: 20, parentId: "s", parentTitle: "TCP", chapterTitle: "Networks" };
const u = (title: string, s: number, e: number, extra: Partial<{ complexity: number }> = {}) => ({
  title, start_page: s, end_page: e, summary: "", complexity: 3, learning_objectives: [], key_concepts: [], ...extra,
});

describe("planWindows", () => {
  it("keeps windows inside leaf sections and bounds their size", () => {
    const wins = planWindows(
      [
        { id: "a", title: "A", start_page: 1, end_page: 5, chapterTitle: "C1" },
        { id: "b", title: "B", start_page: 6, end_page: 40, chapterTitle: "C1" },
      ],
      40,
      () => 1500,
    );
    expect(wins[0]).toMatchObject({ startPage: 1, endPage: 5, parentId: "a" });
    const b = wins.filter((x) => x.parentId === "b");
    expect(b[0]).toMatchObject({ startPage: 6, endPage: 17 });
    expect(b.at(-1)!.endPage).toBe(40);
    for (const x of b) expect(x.endPage - x.startPage + 1).toBeLessThanOrEqual(12);
  });

  it("splits by characters for dense pages and covers unstructured documents", () => {
    const wins = planWindows([], 6, () => 10_000);
    expect(wins.map((x) => [x.startPage, x.endPage])).toEqual([[1, 2], [3, 4], [5, 6]]);
    expect(wins[0].parentId).toBeNull();
  });
});

describe("normaliseUnits", () => {
  it("clamps hallucinated pages, closes gaps, covers the whole window and recomputes time", () => {
    const out = normaliseUnits(
      [u("Handshake", 12, 14, { complexity: 9 }), u("Intro", 3, 11), u("", 15, 16), u("Flow control", 17, 99)],
      w,
      () => 320,
    );
    expect(out.map((x) => [x.title, x.start_page, x.end_page])).toEqual([
      ["Intro", 10, 11],
      ["Handshake", 12, 16],
      ["Flow control", 17, 20],
    ]);
    expect(out[1].complexity).toBe(5);
    expect(out[0].estimated_minutes).toBe(4); // 2 pages * 320 words / 160 wpm
  });

  it("drops duplicates and returns nothing for empty output", () => {
    expect(normaliseUnits([u("A", 10, 20), u("A again", 12, 13)], w, () => 100)).toHaveLength(1);
    expect(normaliseUnits([], w, () => 100)).toEqual([]);
  });
});

describe("normaliseUnits overlaps", () => {
  it("lets neighbours share at most one boundary page", () => {
    const out = normaliseUnits([u("A", 10, 16), u("B", 13, 20)], w, () => 100);
    expect(out.map((x) => [x.start_page, x.end_page])).toEqual([[10, 13], [13, 20]]);
  });
});
