import { describe, expect, it } from "vitest";
import { anchorSchema, normaliseRects, ReadingTracker, snippetAround, textSegments } from "@/lib/reader/anchors";

describe("highlight anchors", () => {
  it("normalises and merges selection rects on the same line", () => {
    const page = { left: 100, top: 50, width: 600, height: 800 };
    const rects = normaliseRects(
      [
        { left: 160, top: 130, width: 120, height: 16 },
        { left: 280, top: 131, width: 60, height: 15 },
        { left: 160, top: 150, width: 200, height: 16 },
        { left: 0, top: 0, width: 0, height: 0 },
      ],
      page,
    );
    expect(rects).toEqual([
      { x: 0.1, y: 0.1, w: 0.3, h: 0.02 },
      { x: 0.1, y: 0.125, w: 0.3333, h: 0.02 },
    ]);
  });

  it("validates anchors", () => {
    expect(anchorSchema.safeParse({ type: "text", start: 5, end: 3 }).success).toBe(false);
    expect(anchorSchema.safeParse({ type: "pdf", rects: [{ x: 2, y: 0, w: 0.1, h: 0.1 }] }).success).toBe(false);
    expect(anchorSchema.safeParse({ type: "text", start: 0, end: 4 }).success).toBe(true);
  });

  it("segments text for overlapping highlights", () => {
    const segs = textSegments("Networks route packets", [
      { id: "a", start: 0, end: 14 },
      { id: "b", start: 9, end: 22 },
    ]);
    expect(segs.map((s) => [s.text, s.highlightIds])).toEqual([
      ["Networks ", ["a"]],
      ["route", ["a", "b"]],
      [" packets", ["b"]],
    ]);
    expect(textSegments("abc", [{ id: "x", start: 10, end: 20 }])).toEqual([{ text: "abc", start: 0, highlightIds: [] }]);
  });

  it("builds search snippets", () => {
    expect(snippetAround("The quick brown fox jumps", "BROWN", 4)).toBe("…ick brown fox…");
    expect(snippetAround("nothing here", "zebra")).toBeNull();
  });
});

describe("ReadingTracker", () => {
  it("counts only active, visible time and marks pages read after dwelling", () => {
    const t = new ReadingTracker(3, 60);
    for (let i = 0; i < 2; i++) t.tick({ visible: true, secondsSinceInput: 5, currentPage: 4 });
    t.tick({ visible: false, secondsSinceInput: 5, currentPage: 4 }); // hidden tab
    t.tick({ visible: true, secondsSinceInput: 500, currentPage: 4 }); // idle
    t.tick({ visible: true, secondsSinceInput: 500, currentPage: 4, listening: true }); // text-to-speech counts
    t.tick({ visible: true, secondsSinceInput: 1, currentPage: 5 });
    expect(t.drain()).toEqual({ seconds: 4, pages: [4] });
    expect(t.drain()).toEqual({ seconds: 0, pages: [] });
    t.restore({ seconds: 7, pages: [9] });
    expect(t.drain()).toEqual({ seconds: 7, pages: [9] });
  });
});
