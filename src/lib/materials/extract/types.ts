/** A heading found in the source, anchored to a 1-based page number. */
export type HeadingCandidate = { title: string; level: 1 | 2; page: number };

export type ExtractedPage = { page: number; text: string };

export type ExtractionResult = {
  pages: ExtractedPage[];
  /** True when page numbers are estimated (DOCX/TXT have no fixed pages). */
  pagesAreEstimated: boolean;
  /** Headings from a document outline/heading styles (high confidence). */
  outline: HeadingCandidate[];
  /** Headings inferred from typography (lower confidence; used when no outline exists). */
  inferredHeadings: HeadingCandidate[];
  /** 1-based page numbers with (almost) no text layer — candidates for OCR. */
  scannedPages: number[];
  wordCount: number;
};

export class ExtractionError extends Error {
  constructor(
    public readonly code: "corrupted" | "encrypted" | "empty" | "unsupported" | "too_large",
    message: string,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}
