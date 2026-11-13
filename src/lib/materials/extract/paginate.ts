import type { ExtractedPage, HeadingCandidate } from "./types";

export type Block = { text: string; heading?: 1 | 2 };

/**
 * Splits flowing text (DOCX/TXT) into estimated pages of ~targetChars, breaking ONLY
 * between blocks (paragraphs, list items, headings) so explanations and examples are
 * never cut mid-paragraph. A heading always starts with the content that follows it:
 * if a heading would be the last block on a page, it moves to the next page.
 */
export function paginate(blocks: Block[], targetChars = 3000): { pages: ExtractedPage[]; headings: HeadingCandidate[] } {
  const pages: ExtractedPage[] = [];
  const headings: HeadingCandidate[] = [];
  let current: string[] = [];
  let size = 0;

  const flush = () => {
    if (current.length) pages.push({ page: pages.length + 1, text: current.join("\n\n") });
    current = [];
    size = 0;
  };

  blocks.forEach((block, i) => {
    const text = block.text.trim();
    if (!text) return;
    // Start a new page before a major heading once the page has meaningful content,
    // or when this block would overflow the page.
    const startsChapter = block.heading === 1 && size > targetChars * 0.35;
    if (current.length && (size + text.length > targetChars || startsChapter)) flush();
    // Keep a heading with its following block.
    const next = blocks[i + 1];
    if (block.heading && next && current.length && size + text.length + next.text.length > targetChars) flush();
    current.push(text);
    size += text.length + 2;
    if (block.heading) headings.push({ title: text.slice(0, 300), level: block.heading, page: pages.length + 1 });
  });
  flush();
  return { pages, headings };
}

/** Plain-text structure detection for TXT/Markdown files. */
export function blocksFromPlainText(text: string): Block[] {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/ /g, " ");
  const paragraphs = normalized.split(/\n{2,}/);
  const blocks: Block[] = [];
  for (const para of paragraphs) {
    const lines = para.split("\n");
    // A paragraph that starts with a heading line: split the heading off.
    const first = lines[0].trim();
    const level = headingLevel(first, lines.length);
    if (level) {
      blocks.push({ text: first.replace(/^#{1,6}\s+/, ""), heading: level });
      const rest = lines.slice(1).join("\n").trim();
      if (rest) blocks.push({ text: rest });
    } else if (para.trim()) {
      blocks.push({ text: para.trim() });
    }
  }
  return blocks;
}

function headingLevel(line: string, linesInPara: number): 1 | 2 | undefined {
  if (!line || line.length > 120) return undefined;
  if (/^#\s+\S/.test(line)) return 1;
  if (/^#{2,3}\s+\S/.test(line)) return 2;
  if (/^(chapter|unit|part|module|section)\s+([0-9]+|[ivxlc]+)\b/i.test(line)) return 1;
  if (/^\d+\.\d+(\.\d+)?\s+\p{Lu}/u.test(line)) return 2;
  if (/^\d{1,2}\.?\s+\p{Lu}[^.!?]{2,80}$/u.test(line) && linesInPara <= 3) return 1;
  const letters = line.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 4 && letters === letters.toUpperCase() && line.split(/\s+/).length <= 10 && !/[.!?,;]$/.test(line))
    return 1;
  return undefined;
}
