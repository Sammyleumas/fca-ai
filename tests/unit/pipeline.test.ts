import { describe, expect, it } from "vitest";
import {
  RetryLaterError,
  runJob,
  wordCountsFromPages,
  type JobPatch,
  type MaterialForProcessing,
  type MaterialPatch,
  type OcrService,
  type PageWrite,
  type ProcessingJob,
  type ProcessingStore,
} from "@/lib/materials/pipeline";
import type { SectionDraft } from "@/lib/materials/structure";
import { computeLeaves, type SectionRow, type SegmentationService } from "@/lib/materials/segmentation";
import type { AiSectionRow } from "@/lib/materials/pipeline";
import { makePdf } from "../fixtures/make";

class MemoryStore implements ProcessingStore {
  material: MaterialForProcessing & MaterialPatch;
  pages = new Map<number, PageWrite>();
  sections: SectionDraft[] = [];
  rows: (SectionRow & { source: string; complexity?: number | null })[] = [];
  job: ProcessingJob & JobPatch;
  notifications: { title: string; body: string }[] = [];
  downloadFails = 0;

  constructor(
    public file: Uint8Array,
    fileType: MaterialForProcessing["file_type"] = "pdf",
  ) {
    this.material = { id: "m1", user_id: "u1", title: "Intro to CS", file_type: fileType, storage_path: "u1/m1/f" };
    this.job = { id: "j1", material_id: "m1", user_id: "u1", attempts: 0, max_attempts: 3, state: {} };
  }
  async getMaterial() {
    return this.material;
  }
  async download() {
    if (this.downloadFails-- > 0) throw new Error("network down");
    return this.file;
  }
  async updateMaterial(_: string, patch: MaterialPatch) {
    Object.assign(this.material, patch);
  }
  async replacePages(_: string, __: string, pages: PageWrite[]) {
    this.pages = new Map(pages.map((p) => [p.page, p]));
  }
  async updatePages(_: string, pages: PageWrite[]) {
    for (const p of pages) this.pages.set(p.page, p);
  }
  async pageWordCounts() {
    return wordCountsFromPages([...this.pages.values()]);
  }
  async replaceSections(_: string, __: string, s: SectionDraft[]) {
    this.sections = s;
    const ids = new Map(s.map((d) => [d.key, crypto.randomUUID()]));
    this.rows = s.map((d) => ({
      id: ids.get(d.key)!, parent_id: d.parentKey ? ids.get(d.parentKey)! : null, level: d.level, position: d.position,
      title: d.title, start_page: d.start_page, end_page: d.end_page, source: "structure",
    }));
  }
  async pageCharCounts() {
    return new Map([...this.pages.values()].map((p) => [p.page, p.text.length]));
  }
  async getPages(_: string, from: number, to: number) {
    return [...this.pages.values()].filter((p) => p.page >= from && p.page <= to).sort((a, b) => a.page - b.page).map((p) => ({ page: p.page, text: p.text }));
  }
  async listLeafSections() {
    return computeLeaves(this.rows);
  }
  async deleteAiSections() {
    this.rows = this.rows.filter((r) => r.source !== "ai");
  }
  async insertAiSections(_: string, __: string, rows: AiSectionRow[]) {
    this.rows.push(...rows.map((r) => ({ ...r, source: "ai" })));
  }
  async updateJob(_: string, patch: JobPatch) {
    Object.assign(this.job, patch);
    if (patch.state) this.job.state = structuredClone(patch.state);
  }
  async notify(_: string, n: { title: string; body: string }) {
    this.notifications.push(n);
  }
}

const ocr = (calls: number[][] = []): OcrService => ({
  async transcribe(_pdf, count) {
    calls.push([count]);
    return Array.from({ length: count }, (_, i) => `Recognised text for scanned page number ${i + 1} with enough characters.`);
  },
});

const far = () => Date.now() + 60_000;

describe("processing pipeline", () => {
  it("processes a PDF end-to-end: pages, outline sections, ready, notification", async () => {
    const store = new MemoryStore(await makePdf({ pages: 8, outline: [{ title: "Basics", page: 1 }, { title: "Networks", page: 5 }] }));
    expect(await runJob(store.job, store, { ocr: null, deadline: far() })).toBe("succeeded");
    expect(store.material.status).toBe("ready");
    expect(store.material.page_count).toBe(8);
    expect(store.material.processing_progress).toBe(100);
    expect(store.pages.size).toBe(8);
    expect(store.sections.map((s) => [s.title, s.start_page, s.end_page])).toEqual([
      ["Basics", 1, 5],
      ["Networks", 5, 8],
    ]);
    expect(store.job.status).toBe("succeeded");
    expect(store.notifications[0].title).toContain("is ready");
  });

  it("transcribes scanned pages with OCR and records them", async () => {
    const calls: number[][] = [];
    const store = new MemoryStore(await makePdf({ pages: 4, blankPages: [2, 3] }));
    expect(await runJob(store.job, store, { ocr: ocr(calls), deadline: far() })).toBe("succeeded");
    expect(calls).toEqual([[2]]);
    expect(store.pages.get(2)).toMatchObject({ ocr_used: true });
    expect(store.pages.get(2)!.text).toContain("Recognised text");
    expect(store.pages.get(1)!.ocr_used).toBe(false);
    expect(store.material.ocr_page_count).toBe(2);
    expect(store.material.processing_warning).toContain("No chapters or learning units were found");
  });

  it("finishes with a warning when OCR is unavailable for some pages", async () => {
    const store = new MemoryStore(await makePdf({ pages: 3, blankPages: [3] }));
    expect(await runJob(store.job, store, { ocr: null, deadline: far() })).toBe("succeeded");
    expect(store.material.processing_warning).toContain("1 page contain no readable text");
  });

  it("fails permanently (no retry) for fully scanned PDFs without OCR", async () => {
    const store = new MemoryStore(await makePdf({ pages: 2, blankPages: [1, 2] }));
    expect(await runJob(store.job, store, { ocr: null, deadline: far() })).toBe("failed");
    expect(store.material.status).toBe("failed");
    expect(store.material.processing_error).toContain("scanned document");
    expect(store.job.status).toBe("failed");
  });

  it("rejects files whose content doesn't match the declared type", async () => {
    const store = new MemoryStore(new TextEncoder().encode("just text pretending to be a pdf"), "pdf");
    expect(await runJob(store.job, store, { ocr: null, deadline: far() })).toBe("failed");
    expect(store.material.processing_error).toContain("don't match");
  });

  it("yields at the deadline and resumes OCR where it stopped", async () => {
    const calls: number[][] = [];
    const blank = Array.from({ length: 12 }, (_, i) => i + 2); // pages 2..13 scanned
    const store = new MemoryStore(await makePdf({ pages: 14, blankPages: blank }));
    let t = 0;
    const clock = () => t;
    const service: OcrService = {
      async transcribe(pdf, count) {
        t += 1000; // each batch "takes" 1s
        return ocr(calls).transcribe(pdf, count);
      },
    };
    expect(await runJob(store.job, store, { ocr: service, deadline: 500, now: clock })).toBe("yielded");
    expect(store.job.status).toBe("queued");
    expect(store.job.state.step).toBe("ocr");
    expect(store.job.state.ocrPending).toHaveLength(4);
    // Next invocation picks up the saved state.
    expect(await runJob({ ...store.job, state: store.job.state }, store, { ocr: service, deadline: Infinity, now: clock })).toBe("succeeded");
    expect(calls.map((c) => c[0])).toEqual([8, 4]);
    expect([...store.pages.values()].filter((p) => p.ocr_used)).toHaveLength(12);
  });

  it("retries transient failures with backoff, then fails after max attempts", async () => {
    const store = new MemoryStore(await makePdf({ pages: 2 }));
    store.downloadFails = 99;
    expect(await runJob(store.job, store, { ocr: null, deadline: far() })).toBe("retrying");
    expect(store.job.status).toBe("queued");
    expect(store.job.attempts).toBe(1);
    expect(new Date(store.job.run_after!).getTime()).toBeGreaterThan(Date.now() + 20_000);
    expect(await runJob({ ...store.job, attempts: 2 }, store, { ocr: null, deadline: far() })).toBe("failed");
    expect(store.material.status).toBe("failed");
    expect(store.material.processing_error).toBe("Something went wrong while processing this material.");
  });

  it("waits and keeps progress when the OCR service asks to retry later", async () => {
    const store = new MemoryStore(await makePdf({ pages: 3, blankPages: [2] }));
    const busy: OcrService = {
      async transcribe() {
        throw new RetryLaterError(60, "busy");
      },
    };
    expect(await runJob(store.job, store, { ocr: busy, deadline: far() })).toBe("retrying");
    expect(store.job.state.step).toBe("ocr");
    expect(store.job.attempts).toBe(0);
    expect(store.pages.size).toBe(3);
  });
});

describe("AI analysis stage", () => {
  const segmenter = (calls: { start: number; end: number; parent: string | null }[]): SegmentationService => ({
    async segment({ window }) {
      calls.push({ start: window.startPage, end: window.endPage, parent: window.parentTitle });
      const mid = Math.floor((window.startPage + window.endPage) / 2);
      return {
        window_title: `Topic ${window.startPage}`,
        units: [
          { title: `Unit A ${window.startPage}`, start_page: window.startPage, end_page: mid, summary: "s", complexity: 4, learning_objectives: ["Explain A"], key_concepts: ["A"] },
          { title: `Unit B ${window.startPage}`, start_page: mid + 1, end_page: window.endPage + 50, summary: "s", complexity: 2, learning_objectives: [], key_concepts: [] },
        ],
      };
    },
  });

  it("divides each detected section into learning units within its pages", async () => {
    const calls: { start: number; end: number; parent: string | null }[] = [];
    const store = new MemoryStore(await makePdf({ pages: 8, outline: [{ title: "Basics", page: 1 }, { title: "Networks", page: 5 }] }));
    expect(await runJob(store.job, store, { ocr: null, segmenter: segmenter(calls), deadline: far() })).toBe("succeeded");
    expect(calls).toEqual([
      { start: 1, end: 5, parent: "Basics" },
      { start: 5, end: 8, parent: "Networks" },
    ]);
    const units = store.rows.filter((r) => r.level === 3);
    expect(units).toHaveLength(4);
    expect(units.every((u) => u.parent_id && u.end_page <= 8)).toBe(true);
    expect(store.material.status).toBe("ready");
    expect(store.notifications.at(-1)!.body).toContain("4 learning units");
    expect((await store.listLeafSections()).map((l) => l.chapterTitle)).toEqual(["Basics", "Basics", "Networks", "Networks"]);
  });

  it("creates chapters for documents with no structure", async () => {
    const store = new MemoryStore(await makePdf({ pages: 3 }));
    await runJob(store.job, store, { ocr: null, segmenter: segmenter([]), deadline: far() });
    expect(store.rows.filter((r) => r.level === 1).map((r) => r.title)).toEqual(["Topic 1"]);
    expect(store.rows.filter((r) => r.level === 3)).toHaveLength(2);
  });

  it("keeps detected sections when analysis of a part fails, and warns", async () => {
    const store = new MemoryStore(await makePdf({ pages: 8, outline: [{ title: "Basics", page: 1 }, { title: "Networks", page: 5 }] }));
    let n = 0;
    const flaky: SegmentationService = {
      async segment(input) {
        if (n++ === 0) throw new Error("model error");
        return segmenter([]).segment(input);
      },
    };
    expect(await runJob(store.job, store, { ocr: null, segmenter: flaky, deadline: far() })).toBe("succeeded");
    expect(store.material.processing_warning).toContain("couldn't process 1 part");
    expect(store.rows.filter((r) => r.level === 3)).toHaveLength(2);
  });

  it("resumes analysis across invocations", async () => {
    const store = new MemoryStore(await makePdf({ pages: 8, outline: [{ title: "Basics", page: 1 }, { title: "Networks", page: 5 }] }));
    let t = 0;
    const slow: SegmentationService = {
      async segment(input) {
        t += 1000;
        return segmenter([]).segment(input);
      },
    };
    expect(await runJob(store.job, store, { ocr: null, segmenter: slow, deadline: 500, now: () => t })).toBe("yielded");
    expect(await runJob({ ...store.job, state: store.job.state }, store, { ocr: null, segmenter: slow, deadline: Infinity, now: () => t })).toBe("succeeded");
    expect(store.rows.filter((r) => r.level === 3)).toHaveLength(4);
  });
});
