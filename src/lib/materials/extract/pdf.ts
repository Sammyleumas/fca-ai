import { getDocumentProxy } from "unpdf";
import { countWords, ExtractionError, type ExtractionResult, type HeadingCandidate } from "./types";

/** A page with fewer characters than this is treated as scanned (image-only). */
export const SCANNED_PAGE_MIN_CHARS = 25;
export const MAX_PDF_PAGES = 2000;

type TextItem = { str: string; height: number; hasEOL?: boolean; transform: number[] };

/**
 * Extracts per-page text, the PDF outline (bookmarks) and typography-based heading
 * candidates. Original page numbers are preserved (1-based).
 */
export async function extractPdf(bytes: Uint8Array): Promise<ExtractionResult> {
  let pdf;
  try {
    // pdf.js may transfer/detach the buffer, so hand it a copy.
    pdf = await getDocumentProxy(new Uint8Array(bytes), { isEvalSupported: false, verbosity: 0 } as never);
  } catch (error) {
    const name = (error as { name?: string })?.name ?? "";
    if (name === "PasswordException") throw new ExtractionError("encrypted", "This PDF is password-protected. Remove the password and upload it again.");
    throw new ExtractionError("corrupted", "This PDF appears to be damaged and couldn't be read.");
  }

  try {
    const numPages = pdf.numPages;
    if (numPages < 1) throw new ExtractionError("empty", "This PDF has no pages.");
    if (numPages > MAX_PDF_PAGES) throw new ExtractionError("too_large", `PDFs can have up to ${MAX_PDF_PAGES} pages.`);

    const pages: ExtractionResult["pages"] = [];
    const lineSamples: { page: number; text: string; height: number }[] = [];
    const heights: number[] = [];
    const scannedPages: number[] = [];

    for (let p = 1; p <= numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      let text = "";
      let line = "";
      let lineHeight = 0;
      const pushLine = () => {
        const t = line.replace(/\s+/g, " ").trim();
        if (t) {
          lineSamples.push({ page: p, text: t, height: lineHeight });
          heights.push(lineHeight);
        }
        line = "";
        lineHeight = 0;
      };
      for (const raw of content.items as unknown[]) {
        const item = raw as TextItem;
        if (typeof item.str !== "string") continue;
        text += item.str + (item.hasEOL ? "\n" : "");
        line += item.str;
        lineHeight = Math.max(lineHeight, Math.abs(item.height || item.transform?.[3] || 0));
        if (item.hasEOL) pushLine();
      }
      pushLine();
      const cleaned = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      if (cleaned.replace(/\s/g, "").length < SCANNED_PAGE_MIN_CHARS) scannedPages.push(p);
      pages.push({ page: p, text: cleaned });
      page.cleanup();
    }

    const outline = await readOutline(pdf, numPages);
    const inferredHeadings = outline.length ? [] : inferHeadings(lineSamples, heights);
    const wordCount = pages.reduce((n, pg) => n + countWords(pg.text), 0);
    return { pages, pagesAreEstimated: false, outline, inferredHeadings, scannedPages, wordCount };
  } finally {
    await (pdf as { destroy?: () => Promise<void> }).destroy?.();
  }
}

type OutlineNode = { title: string; dest: unknown; items?: OutlineNode[] };
type PdfDoc = Awaited<ReturnType<typeof getDocumentProxy>>;

async function readOutline(pdf: PdfDoc, numPages: number): Promise<HeadingCandidate[]> {
  let nodes: OutlineNode[] | null = null;
  try {
    nodes = (await pdf.getOutline()) as OutlineNode[] | null;
  } catch {
    return [];
  }
  if (!nodes?.length) return [];
  const out: HeadingCandidate[] = [];
  const resolve = async (dest: unknown): Promise<number | null> => {
    try {
      const explicit = typeof dest === "string" ? await pdf.getDestination(dest) : (dest as unknown[] | null);
      if (!Array.isArray(explicit) || !explicit[0]) return null;
      const ref = explicit[0];
      const index = typeof ref === "number" ? ref : await pdf.getPageIndex(ref as never);
      return index + 1;
    } catch {
      return null;
    }
  };
  const walk = async (items: OutlineNode[], level: 1 | 2) => {
    for (const node of items) {
      const page = await resolve(node.dest);
      if (page && page <= numPages && node.title?.trim()) out.push({ title: node.title.trim(), level, page });
      if (node.items?.length && level === 1) await walk(node.items, 2);
    }
  };
  await walk(nodes, 1);
  return out;
}

/**
 * Lines set noticeably larger than body text, short, and not ending like a sentence
 * are treated as headings. The two largest distinct sizes map to levels 1 and 2.
 */
export function inferHeadings(lines: { page: number; text: string; height: number }[], heights: number[]): HeadingCandidate[] {
  if (lines.length < 5) return [];
  const sorted = [...heights].filter((h) => h > 0).sort((a, b) => a - b);
  const body = sorted[Math.floor(sorted.length / 2)] ?? 0;
  if (!body) return [];
  const isHeading = (l: { text: string; height: number }) =>
    l.height >= body * 1.25 &&
    l.text.length >= 3 &&
    l.text.length <= 100 &&
    /\p{L}/u.test(l.text) &&
    !/[.,;:]$/.test(l.text) &&
    l.text.split(/\s+/).length <= 14;
  const candidates = lines.filter(isHeading);
  if (!candidates.length || candidates.length > lines.length * 0.3) return [];
  const sizes = [...new Set(candidates.map((c) => Math.round(c.height * 2) / 2))].sort((a, b) => b - a);
  const level1 = sizes[0];
  return candidates.map((c) => ({
    title: c.text,
    level: Math.round(c.height * 2) / 2 >= level1 ? (1 as const) : (2 as const),
    page: c.page,
  }));
}
