import { PDFDocument } from "pdf-lib";
import type { MaterialFileType, MaterialStatus } from "@/types/db";
import { extract, ExtractionError, countWords, type HeadingCandidate } from "./extract";
import { sniffFileType } from "./file-types";
import { buildSections, type SectionDraft } from "./structure";

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
  step?: "extract" | "ocr" | "structure";
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
  replaceSections(materialId: string, userId: string, sections: SectionDraft[]): Promise<void>;
  updateJob(id: string, patch: JobPatch): Promise<void>;
  notify(userId: string, n: { kind: "processing"; title: string; body: string; link: string }): Promise<void>;
}

/** Transcribes a (small) PDF whose pages are all images. Returns text in page order. */
export interface OcrService {
  transcribe(pdf: Uint8Array, pageCount: number): Promise<string[]>;
}

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
  if (state.step === "structure") return 90;
  if (state.step === "ocr" && state.ocrTotal) return 40 + Math.round(((state.ocrDone ?? 0) / state.ocrTotal) * 45);
  return 10;
}

export async function runJob(
  job: ProcessingJob,
  store: ProcessingStore,
  deps: { ocr: OcrService | null; deadline: number; now?: () => number },
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

      const unreadable = (state.ocrFailed?.length ?? 0) + (state.scannedWithoutOcr ?? 0);
      const warnings: string[] = [];
      if (unreadable) warnings.push(`${unreadable} page${unreadable === 1 ? "" : "s"} contain no readable text (scanned images we couldn't transcribe).`);
      if (!sections.length) warnings.push("No chapter headings were detected. AI structuring (coming next) will divide this material into study sections.");
      if (state.pagesAreEstimated) warnings.push("Page numbers are estimated because this format has no fixed pages.");

      await store.updateMaterial(material.id, {
        status: "ready",
        status_detail: null,
        processing_progress: 100,
        processing_error: null,
        processing_warning: warnings.join(" ") || null,
        word_count: totalWords || state.wordCount || 0,
        ocr_page_count: (state.ocrDone ?? 0) - (state.ocrFailed?.length ?? 0),
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
      await store.notify(material.user_id, {
        kind: "processing",
        title: `“${material.title.slice(0, 120)}” is ready`,
        body: sections.length ? `We found ${sections.filter((s) => s.level === 1).length} chapters and ${sections.filter((s) => s.level === 2).length} sections.` : "Your material is ready to study.",
        link: `/library/${material.id}`,
      });
      return "succeeded";
    }
    return "yielded";
  } catch (error) {
    return handleFailure(job, material, store, error, now);
  }
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
