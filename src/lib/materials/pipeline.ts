import { PDFDocument } from "pdf-lib";
import type { MaterialFileType, MaterialStatus } from "@/types/db";
import { extract, ExtractionError, countWords, type HeadingCandidate } from "./extract";
import { sniffFileType } from "./file-types";
import { buildSections, type SectionDraft } from "./structure";
import {
  normaliseUnits,
  planWindows,
  type AnalysisWindow,
  type LeafSection,
  type SegmentationService,
} from "./segmentation";

/**
 * Resumable document-processing state machine.
 *
 *   extract  → download, verify content type, extract per-page text + headings
 *   ocr      → transcribe image-only pages in small batches (optional)
 *   structure→ build chapter/subtopic sections with page ranges → material ready
 *
 * Each call works until `deadline`, persists its state on the job and yields, so
 * large documents continue across short serverless invocations. Storage and OCR are
 * injected, which keeps the pipeline testable without Supabase or an AI provider.
 */

export type JobState = {
  step?: "extract" | "ocr" | "structure" | "analyse";
  windows?: AnalysisWindow[];
  analyseTotal?: number;
  analyseDone?: number;
  analyseFailed?: number;
  unitsCreated?: number;
  headings?: HeadingCandidate[];
  headingSource?: "outline" | "inferred" | "none";
  pageCount?: number;
  wordCount?: number;
  pagesAreEstimated?: boolean;
  ocrPending?: number[];
  ocrDone?: number;
  ocrFailed?: number[];
  ocrTotal?: number;
  scannedWithoutOcr?: number;
};

export type ProcessingJob = {
  id: string;
  material_id: string;
  user_id: string;
  attempts: number;
  max_attempts: number;
  state: JobState;
};

export type MaterialForProcessing = {
  id: string;
  user_id: string;
  title: string;
  file_type: MaterialFileType;
  storage_path: string;
};

export type PageWrite = { page: number; text: string; ocr_used: boolean };

export type MaterialPatch = Partial<{
  status: MaterialStatus;
  status_detail: string | null;
  processing_progress: number;
  processing_error: string | null;
  processing_warning: string | null;
  page_count: number;
  word_count: number;
  pages_are_estimated: boolean;
  ocr_page_count: number;
}>;

export type JobPatch = Partial<{
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  stage: MaterialStatus;
  progress: number;
  attempts: number;
  error: string | null;
  run_after: string;
  locked_at: string | null;
  locked_by: string | null;
  finished_at: string | null;
  state: JobState;
}>;

export interface ProcessingStore {
  getMaterial(id: string): Promise<MaterialForProcessing | null>;
  download(path: string): Promise<Uint8Array>;
  updateMaterial(id: string, patch: MaterialPatch): Promise<void>;
  replacePages(materialId: string, userId: string, pages: PageWrite[]): Promise<void>;
  updatePages(materialId: string, pages: PageWrite[]): Promise<void>;
  pageWordCounts(materialId: string): Promise<Map<number, number>>;
  pageCharCounts(materialId: string): Promise<Map<number, number>>;
  getPages(materialId: string, from: number, to: number): Promise<{ page: number; text: string }[]>;
  replaceSections(materialId: string, userId: string, sections: SectionDraft[]): Promise<void>;
  /** Leaf sections (no children) in reading order, with their chapter title. */
  listLeafSections(materialId: string): Promise<LeafSection[]>;
  deleteAiSections(materialId: string): Promise<void>;
  insertAiSections(materialId: string, userId: string, rows: AiSectionRow[]): Promise<void>;
  updateJob(id: string, patch: JobPatch): Promise<void>;
  notify(userId: string, n: { kind: "processing"; title: string; body: string; link: string }): Promise<void>;
}

/** Transcribes a (small) PDF whose pages are all images. Returns text in page order. */
export interface OcrService {
  transcribe(pdf: Uint8Array, pageCount: number): Promise<string[]>;
}

export type AiSectionRow = {
  id: string;
  parent_id: string | null;
  level: 1 | 3;
  position: number;
  title: string;
  summary: string | null;
  start_page: number;
  end_page: number;
  estimated_minutes: number;
  complexity: number | null;
  learning_objectives: string[];
  key_concepts: string[];
};

export class RetryLaterError extends Error {
  constructor(public readonly delaySeconds: number, message: string) {
    super(message);
  }
}

export const OCR_BATCH_PAGES = 8;

export type StepOutcome = "succeeded" | "yielded" | "retrying" | "failed";

/** Copies selected 1-based pages into a new PDF (for batched OCR). */
export async function slicePdf(bytes: Uint8Array, pages: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, pages.map((p) => p - 1));
  copied.forEach((p) => out.addPage(p));
  return out.save();
}

function progressFor(state: JobState): number {
  if (state.step === "analyse" && state.analyseTotal) return 60 + Math.round(((state.analyseDone ?? 0) / state.analyseTotal) * 38);
  if (state.step === "structure") return 55;
  if (state.step === "ocr" && state.ocrTotal) return 40 + Math.round(((state.ocrDone ?? 0) / state.ocrTotal) * 45);
  return 10;
}

export async function runJob(
  job: ProcessingJob,
  store: ProcessingStore,
  deps: { ocr: OcrService | null; segmenter?: SegmentationService | null; deadline: number; now?: () => number },
): Promise<StepOutcome> {
  const now = deps.now ?? Date.now;
  const state: JobState = { step: "extract", ...job.state };
  const material = await store.getMaterial(job.material_id);
  if (!material) {
    await store.updateJob(job.id, { status: "cancelled", finished_at: new Date().toISOString(), error: "Material deleted" });
    return "failed";
  }

  const save = async (stage: MaterialStatus, detail: string) => {
    const progress = progressFor(state);
    await store.updateJob(job.id, { state, stage, progress });
    await store.updateMaterial(material.id, { status: stage, status_detail: detail, processing_progress: progress });
  };

  try {
    // ---------------------------------------------------------------- extract
    if (state.step === "extract") {
      await store.updateMaterial(material.id, { status: "extracting", status_detail: "Reading your document…", processing_progress: 5, processing_error: null });
      const bytes = await store.download(material.storage_path);
      const sniffed = sniffFileType(bytes, material.file_type);
      if (sniffed !== material.file_type) {
        throw new ExtractionError("unsupported", "This file's contents don't match its type. Please upload a genuine PDF, DOCX or TXT file.");
      }
      const result = await extract(material.file_type, bytes);
      const scanned = new Set(result.scannedPages);
      if (result.pages.length && scanned.size === result.pages.length && !deps.ocr) {
        throw new ExtractionError(
          "unsupported",
          "This looks like a scanned document with no selectable text, and text recognition isn't available right now.",
        );
      }
      await store.replacePages(
        material.id,
        material.user_id,
        result.pages.map((p) => ({ page: p.page, text: p.text, ocr_used: false })),
      );
      const headings = result.outline.length ? result.outline : result.inferredHeadings;
      const nextStep: JobState["step"] = deps.ocr && result.scannedPages.length ? "ocr" : "structure";
      Object.assign(state, {
        headings,
        headingSource: result.outline.length ? "outline" : result.inferredHeadings.length ? "inferred" : "none",
        pageCount: result.pages.length,
        wordCount: result.wordCount,
        pagesAreEstimated: result.pagesAreEstimated,
        ocrPending: deps.ocr ? result.scannedPages : [],
        ocrTotal: deps.ocr ? result.scannedPages.length : 0,
        ocrDone: 0,
        ocrFailed: [],
        scannedWithoutOcr: deps.ocr ? 0 : result.scannedPages.length,
        step: nextStep,
      } satisfies JobState);
      await store.updateMaterial(material.id, {
        page_count: result.pages.length,
        word_count: result.wordCount,
        pages_are_estimated: result.pagesAreEstimated,
      });
      await save(nextStep === "ocr" ? "extracting" : "structuring", nextStep === "ocr" ? "Recognising scanned pages…" : "Finding chapters and sections…");
      if (now() >= deps.deadline) return yieldJob(job, store);
    }

    // -------------------------------------------------------------------- ocr
    if (state.step === "ocr") {
      if (!deps.ocr) {
        state.scannedWithoutOcr = (state.scannedWithoutOcr ?? 0) + (state.ocrPending?.length ?? 0);
        state.ocrPending = [];
      } else {
        let bytes: Uint8Array | null = null;
        while (state.ocrPending?.length && now() < deps.deadline) {
          bytes ??= await store.download(material.storage_path);
          const batch = state.ocrPending.slice(0, OCR_BATCH_PAGES);
          let texts: string[] | null = null;
          try {
            texts = await deps.ocr.transcribe(await slicePdf(bytes, batch), batch.length);
          } catch (error) {
            if (error instanceof RetryLaterError) {
              await store.updateJob(job.id, { state });
              throw error;
            }
            state.ocrFailed = [...(state.ocrFailed ?? []), ...batch];
          }
          if (texts) {
            const writes = batch
              .map((page, i) => ({ page, text: (texts![i] ?? "").trim(), ocr_used: true }))
              .filter((w) => w.text.length > 0);
            if (writes.length) await store.updatePages(material.id, writes);
            const empty = batch.filter((p) => !writes.some((w) => w.page === p));
            if (empty.length) state.ocrFailed = [...(state.ocrFailed ?? []), ...empty];
          }
          state.ocrPending = state.ocrPending.slice(batch.length);
          state.ocrDone = (state.ocrDone ?? 0) + batch.length;
          await save("extracting", `Recognising scanned pages (${state.ocrDone}/${state.ocrTotal})…`);
        }
      }
      if (state.ocrPending?.length) return yieldJob(job, store);
      state.step = "structure";
      await save("structuring", "Finding chapters and sections…");
    }

    // -------------------------------------------------------------- structure
    if (state.step === "structure") {
      const pageCount = state.pageCount ?? 0;
      const words = await store.pageWordCounts(material.id);
      const sections = buildSections(state.headings ?? [], pageCount, (p) => words.get(p) ?? 0);
      await store.replaceSections(material.id, material.user_id, sections);
      const totalWords = [...words.values()].reduce((a, b) => a + b, 0);
      state.wordCount = totalWords || state.wordCount || 0;
      if (deps.segmenter && totalWords > 0) {
        state.step = "analyse";
        await save("analysing", "Analysing topics and learning units…");
        if (now() >= deps.deadline) return yieldJob(job, store);
      } else {
        return finish(job, material, store, state);
      }
    }

    // ---------------------------------------------------------------- analyse
    if (state.step === "analyse") {
      if (!deps.segmenter) return finish(job, material, store, state);
      if (!state.windows) {
        await store.deleteAiSections(material.id);
        const chars = await store.pageCharCounts(material.id);
        const leaves = await store.listLeafSections(material.id);
        state.windows = planWindows(leaves, state.pageCount ?? Math.max(0, ...chars.keys()), (p) => chars.get(p) ?? 0);
        state.analyseTotal = state.windows.length;
        state.analyseDone = 0;
        state.analyseFailed = 0;
        state.unitsCreated = 0;
        await save("analysing", "Analysing topics and learning units…");
      }
      const words = await store.pageWordCounts(material.id);
      const chapterPos = 1000; // AI chapters (documents without structure) sort after none
      while (state.windows.length && now() < deps.deadline) {
        const window = state.windows[0];
        const pages = await store.getPages(material.id, window.startPage, window.endPage);
        try {
          if (pages.some((p) => p.text.trim())) {
            const out = await deps.segmenter.segment({ materialTitle: material.title, window, pages });
            const units = normaliseUnits(out.units, window, (p) => words.get(p) ?? 0);
            const rows: AiSectionRow[] = [];
            let parentId = window.parentId;
            if (!parentId && units.length) {
              parentId = crypto.randomUUID();
              rows.push({
                id: parentId, parent_id: null, level: 1, position: chapterPos + (state.analyseDone ?? 0),
                title: out.window_title.trim().slice(0, 300) || `Pages ${window.startPage}–${window.endPage}`,
                summary: null, start_page: window.startPage, end_page: window.endPage,
                estimated_minutes: units.reduce((n, u) => n + u.estimated_minutes, 0),
                complexity: null, learning_objectives: [], key_concepts: [],
              });
            }
            // A single unit spanning the whole leaf adds nothing: the leaf is already the unit.
            const redundant = window.parentId && units.length === 1;
            if (!redundant) {
              units.forEach((u, i) =>
                rows.push({ id: crypto.randomUUID(), parent_id: parentId, level: 3, position: i, ...u }),
              );
            }
            if (rows.length) await store.insertAiSections(material.id, material.user_id, rows);
            state.unitsCreated = (state.unitsCreated ?? 0) + rows.filter((r) => r.level === 3).length;
          }
        } catch (error) {
          if (error instanceof RetryLaterError) {
            await store.updateJob(job.id, { state });
            throw error;
          }
          state.analyseFailed = (state.analyseFailed ?? 0) + 1;
        }
        state.windows = state.windows.slice(1);
        state.analyseDone = (state.analyseDone ?? 0) + 1;
        await save("analysing", `Analysing topics and learning units (${state.analyseDone}/${state.analyseTotal})…`);
      }
      if (state.windows.length) return yieldJob(job, store);
      return finish(job, material, store, state);
    }
    return "yielded";
  } catch (error) {
    return handleFailure(job, material, store, error, now);
  }
}

async function finish(
  job: ProcessingJob,
  material: MaterialForProcessing,
  store: ProcessingStore,
  state: JobState,
): Promise<StepOutcome> {
  const leaves = await store.listLeafSections(material.id);
  const unreadable = (state.ocrFailed?.length ?? 0) + (state.scannedWithoutOcr ?? 0);
  const warnings: string[] = [];
  if (unreadable) warnings.push(`${unreadable} page${unreadable === 1 ? "" : "s"} contain no readable text (scanned images we couldn't transcribe).`);
  if (!leaves.length) warnings.push("No chapters or learning units were found. The planner will use page ranges for this material.");
  if (state.analyseFailed) warnings.push(`AI analysis couldn't process ${state.analyseFailed} part${state.analyseFailed === 1 ? "" : "s"} of this material; those parts use the detected sections. Use “Analyse again” to retry.`);
  if (state.pagesAreEstimated) warnings.push("Page numbers are estimated because this format has no fixed pages.");

  await store.updateMaterial(material.id, {
    status: "ready",
    status_detail: null,
    processing_progress: 100,
    processing_error: null,
    processing_warning: warnings.join(" ") || null,
    ...(state.wordCount ? { word_count: state.wordCount } : {}),
    ...(state.ocrDone !== undefined ? { ocr_page_count: (state.ocrDone ?? 0) - (state.ocrFailed?.length ?? 0) } : {}),
  });
  await store.updateJob(job.id, {
    status: "succeeded",
    stage: "ready",
    progress: 100,
    state,
    error: null,
    finished_at: new Date().toISOString(),
    locked_at: null,
    locked_by: null,
  });
  const units = state.unitsCreated ?? 0;
  await store.notify(material.user_id, {
    kind: "processing",
    title: `“${material.title.slice(0, 120)}” is ready`,
    body: units
      ? `FCA-AI organised it into ${units} learning units, ready for your study plan.`
      : leaves.length
        ? `We found ${leaves.length} sections, ready for your study plan.`
        : "Your material is ready to study.",
    link: `/library/${material.id}`,
  });
  return "succeeded";
}

async function yieldJob(job: ProcessingJob, store: ProcessingStore): Promise<StepOutcome> {
  await store.updateJob(job.id, { status: "queued", run_after: new Date().toISOString(), locked_at: null, locked_by: null });
  return "yielded";
}

async function handleFailure(
  job: ProcessingJob,
  material: MaterialForProcessing,
  store: ProcessingStore,
  error: unknown,
  now: () => number,
): Promise<StepOutcome> {
  if (error instanceof RetryLaterError) {
    await store.updateJob(job.id, {
      status: "queued",
      run_after: new Date(now() + error.delaySeconds * 1000).toISOString(),
      locked_at: null,
      locked_by: null,
    });
    await store.updateMaterial(material.id, { status_detail: "Waiting for the text-recognition service…" });
    return "retrying";
  }

  // Problems with the file itself are permanent: don't retry automatically.
  const permanent = error instanceof ExtractionError;
  const attempts = job.attempts + 1;
  const message = permanent
    ? (error as ExtractionError).message
    : "Something went wrong while processing this material.";
  if (!permanent && attempts < job.max_attempts) {
    const delay = 30 * 2 ** (attempts - 1);
    await store.updateJob(job.id, {
      status: "queued",
      attempts,
      error: error instanceof Error ? error.message.slice(0, 500) : "unknown error",
      run_after: new Date(now() + delay * 1000).toISOString(),
      locked_at: null,
      locked_by: null,
    });
    await store.updateMaterial(material.id, { status_detail: `Retrying shortly (attempt ${attempts + 1} of ${job.max_attempts})…` });
    return "retrying";
  }
  await store.updateJob(job.id, {
    status: "failed",
    attempts,
    error: error instanceof Error ? error.message.slice(0, 500) : "unknown error",
    finished_at: new Date().toISOString(),
    locked_at: null,
    locked_by: null,
  });
  await store.updateMaterial(material.id, {
    status: "failed",
    status_detail: null,
    processing_error: message,
  });
  await store.notify(material.user_id, {
    kind: "processing",
    title: `We couldn't process “${material.title.slice(0, 120)}”`,
    body: message,
    link: `/library/${material.id}`,
  });
  return "failed";
}

/** Words per stored page (used by the Supabase store and tests). */
export function wordCountsFromPages(pages: { page: number; text: string }[]): Map<number, number> {
  return new Map(pages.map((p) => [p.page, countWords(p.text)]));
}
