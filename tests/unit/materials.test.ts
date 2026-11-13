import { describe, expect, it } from "vitest";
import { checkFileMeta, sanitizeFilename, sniffFileType, titleFromFilename } from "@/lib/materials/file-types";
import { blocksFromPlainText, paginate } from "@/lib/materials/extract/paginate";
import { buildSections } from "@/lib/materials/structure";
import { extract, ExtractionError } from "@/lib/materials/extract";
import { makeDocx, makePdf } from "../fixtures/make";

const MB = 1024 * 1024;

describe("file validation", () => {
  it("accepts supported types and rejects others", () => {
    expect(checkFileMeta({ name: "notes.pdf", size: 10, type: "application/pdf" }, MB)).toEqual({ ok: true, fileType: "pdf" });
    expect(checkFileMeta({ name: "a.DOCX", size: 10, type: "" }, MB)).toEqual({ ok: true, fileType: "docx" });
    expect(checkFileMeta({ name: "a.txt", size: 10, type: "text/plain" }, MB)).toEqual({ ok: true, fileType: "txt" });
    expect(checkFileMeta({ name: "a.exe", size: 10 }, MB).ok).toBe(false);
    expect(checkFileMeta({ name: "a.pdf", size: 10, type: "image/png" }, MB).ok).toBe(false);
    expect(checkFileMeta({ name: "a.pdf", size: 0 }, MB).ok).toBe(false);
    expect(checkFileMeta({ name: "a.pdf", size: 2 * MB }, MB).ok).toBe(false);
  });

  it("sanitises file names and derives titles", () => {
    expect(sanitizeFilename("Résumé de cours (v2).PDF")).toBe("Resume-de-cours-v2.pdf");
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("..\\..\\evil.pdf")).toBe("evil.pdf");
    expect(sanitizeFilename("...")).toBe("document");
    expect(titleFromFilename("intro_to-CS_v2.pdf")).toBe("Intro to CS v2");
  });

  it("sniffs real content type by magic bytes", () => {
    const enc = new TextEncoder();
    expect(sniffFileType(enc.encode("%PDF-1.7 ..."), "pdf")).toBe("pdf");
    expect(sniffFileType(new Uint8Array([0x50, 0x4b, 3, 4, 0]), "docx")).toBe("docx");
    expect(sniffFileType(enc.encode("MZ executable"), "pdf")).toBeNull();
    expect(sniffFileType(enc.encode("Hello ✓ world"), "txt")).toBe("txt");
    expect(sniffFileType(new Uint8Array([0x48, 0, 0x49]), "txt")).toBeNull();
    expect(sniffFileType(new Uint8Array([0xff, 0xfe, 0xfd]), "txt")).toBeNull();
  });
});

describe("pagination", () => {
  it("never splits a paragraph and keeps headings with their content", () => {
    const para = "x".repeat(1000);
    const { pages, headings } = paginate(
      [{ text: "Chapter 1", heading: 1 }, { text: para }, { text: para }, { text: "Section 1.1", heading: 2 }, { text: para }, { text: para }],
      2500,
    );
    for (const p of pages) expect(p.text.split("\n\n").every((b) => b === para || b.startsWith("Chapter") || b.startsWith("Section"))).toBe(true);
    const sectionPage = headings.find((h) => h.title === "Section 1.1")!.page;
    expect(pages[sectionPage - 1].text.startsWith("Section 1.1")).toBe(true);
  });

  it("detects plain-text headings", () => {
    const blocks = blocksFromPlainText("# Networks\n\nIntro text.\n\nCHAPTER 2 ROUTING\nRouting moves packets.\n\n2.1 Static Routes\n\nBody.");
    expect(blocks.filter((b) => b.heading).map((b) => [b.text, b.heading])).toEqual([
      ["Networks", 1],
      ["CHAPTER 2 ROUTING", 1],
      ["2.1 Static Routes", 2],
    ]);
  });
});

describe("section building", () => {
  it("builds chapter → subtopic ranges and an introduction for leading pages", () => {
    const s = buildSections(
      [
        { title: "Networks", level: 1, page: 3 },
        { title: "TCP", level: 2, page: 4 },
        { title: "UDP", level: 2, page: 6 },
        { title: "Databases", level: 1, page: 9 },
      ],
      12,
      () => 320,
    );
    expect(s.map((x) => [x.title, x.level, x.start_page, x.end_page])).toEqual([
      ["Introduction", 1, 1, 3],
      ["Networks", 1, 3, 9],
      ["TCP", 2, 4, 6],
      ["UDP", 2, 6, 9],
      ["Databases", 1, 9, 12],
    ]);
    expect(s[0].estimated_minutes).toBe(6); // 3 pages * 320 words / 160 wpm
    expect(s[2].parentKey).toBe(s[1].key);
  });

  it("drops running headers repeated on most pages", () => {
    const hs = Array.from({ length: 20 }, (_, i) => ({ title: "Lecture Notes", level: 1 as const, page: i + 1 }));
    expect(buildSections([...hs, { title: "Real chapter", level: 1, page: 5 }], 20, () => 100).map((x) => x.title)).toEqual([
      "Introduction",
      "Real chapter",
    ]);
  });
});

describe("extraction", () => {
  it("extracts PDF text per page, keeps page numbers, reads the outline and flags scanned pages", async () => {
    const bytes = await makePdf({
      pages: 6,
      blankPages: [5],
      outline: [
        { title: "Chapter One", page: 1 },
        { title: "Chapter Two", page: 4 },
      ],
    });
    const r = await extract("pdf", bytes);
    expect(r.pages).toHaveLength(6);
    expect(r.pages[1].text).toContain("(2.0)");
    expect(r.pagesAreEstimated).toBe(false);
    expect(r.scannedPages).toEqual([5]);
    expect(r.outline).toEqual([
      { title: "Chapter One", level: 1, page: 1 },
      { title: "Chapter Two", level: 1, page: 4 },
    ]);
    expect(r.wordCount).toBeGreaterThan(100);
  });

  it("infers PDF headings from typography when there is no outline", async () => {
    const r = await extract("pdf", await makePdf({ pages: 6, headings: { 1: "Introduction to Networks", 4: "Routing Basics" } }));
    expect(r.outline).toEqual([]);
    expect(r.inferredHeadings.map((h) => [h.title, h.page])).toEqual([
      ["Introduction to Networks", 1],
      ["Routing Basics", 4],
    ]);
  });

  it("rejects corrupted PDFs with a friendly error", async () => {
    const bad = new TextEncoder().encode("%PDF-1.7\nthis is not really a pdf");
    await expect(extract("pdf", bad)).rejects.toBeInstanceOf(ExtractionError);
  });

  it("extracts DOCX with heading levels and estimated pages", async () => {
    const r = await extract(
      "docx",
      await makeDocx([
        { heading: "Software Engineering", paragraphs: 20 },
        { heading: "Requirements", level: 2, paragraphs: 20 },
        { heading: "Testing", paragraphs: 20 },
      ]),
    );
    expect(r.pagesAreEstimated).toBe(true);
    expect(r.pages.length).toBeGreaterThan(3);
    expect(r.outline.map((h) => [h.title, h.level])).toEqual([
      ["Software Engineering", 1],
      ["Requirements", 2],
      ["Testing", 1],
    ]);
    const testing = r.outline.find((h) => h.title === "Testing")!;
    expect(r.pages[testing.page - 1].text).toContain("Testing");
  });

  it("rejects a corrupted DOCX", async () => {
    await expect(extract("docx", new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3]))).rejects.toBeInstanceOf(ExtractionError);
  });

  it("extracts TXT and rejects empty files", async () => {
    const r = await extract("txt", new TextEncoder().encode("# Physics\n\nForces and motion.\n\n## Newton\n\nF = ma."));
    expect(r.outline.map((h) => h.title)).toEqual(["Physics", "Newton"]);
    await expect(extract("txt", new TextEncoder().encode("   \n\n "))).rejects.toThrow(/doesn't contain any text/);
  });
});
