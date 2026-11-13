import { PDFDocument, PDFName, PDFString, StandardFonts, type PDFRef } from "pdf-lib";
import { Document, HeadingLevel, Packer, Paragraph } from "docx";

const LOREM =
  "Computer science is the study of computers and computational systems. It involves the design, development and application of software, hardware and algorithms to solve real-world problems.";

/** Text PDF. `headings` puts a large title on the given pages; `blankPages` have no text (scanned). */
export async function makePdf({
  pages = 6,
  headings = {} as Record<number, string>,
  blankPages = [] as number[],
  outline = [] as { title: string; page: number }[],
}: {
  pages?: number;
  headings?: Record<number, string>;
  blankPages?: number[];
  outline?: { title: string; page: number }[];
} = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const refs: PDFRef[] = [];
  for (let p = 1; p <= pages; p++) {
    const page = doc.addPage([595, 842]);
    refs.push(page.ref);
    if (blankPages.includes(p)) continue;
    let y = 780;
    if (headings[p]) {
      page.drawText(headings[p], { x: 50, y, size: 22, font: bold });
      y -= 40;
    }
    for (let i = 0; i < 12; i++) {
      page.drawText(`${LOREM.slice(0, 80)} (${p}.${i})`, { x: 50, y, size: 10, font });
      y -= 16;
    }
  }
  if (outline.length) {
    const ctx = doc.context;
    const outlinesRef = ctx.nextRef();
    const itemRefs = outline.map(() => ctx.nextRef());
    outline.forEach((o, i) => {
      const dict = ctx.obj({
        Title: PDFString.of(o.title),
        Parent: outlinesRef,
        Dest: ctx.obj([refs[o.page - 1], PDFName.of("Fit")]),
        ...(i > 0 ? { Prev: itemRefs[i - 1] } : {}),
        ...(i < outline.length - 1 ? { Next: itemRefs[i + 1] } : {}),
      });
      ctx.assign(itemRefs[i], dict);
    });
    ctx.assign(outlinesRef, ctx.obj({ Type: "Outlines", First: itemRefs[0], Last: itemRefs[itemRefs.length - 1], Count: outline.length }));
    doc.catalog.set(PDFName.of("Outlines"), outlinesRef);
  }
  return doc.save();
}

export async function makeDocx(sections: { heading: string; level?: 1 | 2; paragraphs: number }[]): Promise<Uint8Array> {
  const children: Paragraph[] = [];
  for (const s of sections) {
    children.push(new Paragraph({ text: s.heading, heading: s.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1 }));
    for (let i = 0; i < s.paragraphs; i++) children.push(new Paragraph({ text: `${LOREM} [${s.heading} ¶${i + 1}]` }));
  }
  const doc = new Document({ sections: [{ children }] });
  return new Uint8Array(await Packer.toBuffer(doc));
}
