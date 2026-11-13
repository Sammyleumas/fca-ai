import mammoth from "mammoth";
import { blocksFromPlainText, paginate, type Block } from "./paginate";
import { countWords, ExtractionError, type ExtractionResult } from "./types";

const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

const stripTags = (s: string) => decodeEntities(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).trim();

/**
 * DOCX → semantic blocks via mammoth's HTML (headings keep their level), then
 * paginated into estimated pages without splitting paragraphs.
 */
export async function extractDocx(bytes: Uint8Array): Promise<ExtractionResult> {
  let html: string;
  try {
    const result = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) }, { includeDefaultStyleMap: true });
    html = result.value;
  } catch {
    throw new ExtractionError("corrupted", "This Word document appears to be damaged and couldn't be read.");
  }

  const blocks: Block[] = [];
  const re = /<(h[1-6]|p|li|td|th|pre)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    const text = stripTags(m[2]);
    if (!text) continue;
    if (tag === "h1") blocks.push({ text, heading: 1 });
    else if (tag[0] === "h") blocks.push({ text, heading: tag === "h2" ? (blocks.some((b) => b.heading === 1) ? 2 : 1) : 2 });
    else if (tag === "li") blocks.push({ text: `• ${text}` });
    else blocks.push({ text });
  }

  // Documents without heading styles: fall back to plain-text heuristics.
  const useBlocks = blocks.some((b) => b.heading) ? blocks : blocksFromPlainText(blocks.map((b) => b.text).join("\n\n"));
  if (!useBlocks.length) throw new ExtractionError("empty", "This document doesn't contain any readable text.");

  const { pages, headings } = paginate(useBlocks);
  const styled = blocks.some((b) => b.heading);
  return {
    pages,
    pagesAreEstimated: true,
    outline: styled ? headings : [],
    inferredHeadings: styled ? [] : headings,
    scannedPages: [],
    wordCount: pages.reduce((n, p) => n + countWords(p.text), 0),
  };
}
