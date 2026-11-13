import { blocksFromPlainText, paginate } from "./paginate";
import { countWords, ExtractionError, type ExtractionResult } from "./types";

export async function extractText(bytes: Uint8Array): Promise<ExtractionResult> {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    throw new ExtractionError("unsupported", "This text file isn't valid UTF-8. Save it as UTF-8 and upload again.");
  }
  const blocks = blocksFromPlainText(text);
  if (!blocks.length) throw new ExtractionError("empty", "This file doesn't contain any text.");
  const { pages, headings } = paginate(blocks);
  return {
    pages,
    pagesAreEstimated: true,
    outline: /^#\s/m.test(text) ? headings : [],
    inferredHeadings: /^#\s/m.test(text) ? [] : headings,
    scannedPages: [],
    wordCount: pages.reduce((n, p) => n + countWords(p.text), 0),
  };
}
