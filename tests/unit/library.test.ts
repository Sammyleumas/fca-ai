import { describe, expect, it } from "vitest";
import { applyLibraryQuery, filterCounts, parseLibraryQuery, type LibraryItem } from "@/lib/materials/library-filter";

const NOW = new Date("2026-11-14T12:00:00Z").getTime();
const base: LibraryItem = {
  id: "", title: "", original_filename: "x.pdf", file_type: "pdf", size_bytes: 1, page_count: 10, pages_are_estimated: false,
  status: "ready", status_detail: null, processing_progress: 100, processing_error: null, processing_warning: null,
  created_at: "2026-10-01T00:00:00Z", last_opened_at: null, subject: null, folder: null, progress: 0, lastReadAt: null, plans: [],
};
const items: LibraryItem[] = [
  { ...base, id: "a", title: "Networks", progress: 40, subject: { id: "11111111-1111-1111-1111-111111111111", name: "CS", kind: "subject" } },
  { ...base, id: "b", title: "Databases", file_type: "docx", progress: 100 },
  { ...base, id: "c", title: "Maths notes", file_type: "txt", status: "extracting", created_at: "2026-11-13T00:00:00Z" },
  { ...base, id: "d", title: "Physics", status: "failed", created_at: "2026-11-12T00:00:00Z" },
  { ...base, id: "e", title: "algorithms 2", plans: [{ id: "p", title: "Exam", status: "active" }] },
  { ...base, id: "f", title: "Algorithms 10" },
];

describe("library filtering", () => {
  it("counts each filter", () => {
    expect(filterCounts(items, NOW)).toEqual({
      all: 6, pdf: 4, docx: 1, txt: 1, recent: 2, studying: 2, completed: 1, processing: 1, failed: 1,
    });
  });

  it("filters by subject and search, and sorts naturally by title", () => {
    const q = parseLibraryQuery({ filter: "all", sort: "title", q: "ALGO" });
    expect(applyLibraryQuery(items, q, NOW).map((m) => m.id)).toEqual(["e", "f"]);
    const bySubject = parseLibraryQuery({ subject: "11111111-1111-1111-1111-111111111111" });
    expect(applyLibraryQuery(items, bySubject, NOW).map((m) => m.id)).toEqual(["a"]);
    const noSubject = parseLibraryQuery({ subject: "none", filter: "studying" });
    expect(applyLibraryQuery(items, noSubject, NOW).map((m) => m.id)).toEqual(["e"]);
  });

  it("ignores invalid query params", () => {
    expect(parseLibraryQuery({ filter: "drop table", sort: "evil", subject: "x'; --" })).toEqual({
      filter: "all", sort: "recent", subject: undefined, folder: undefined, q: undefined,
    });
  });
});
