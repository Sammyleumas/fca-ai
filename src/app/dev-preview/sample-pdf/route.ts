import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** DEVELOPMENT-ONLY sample PDF for the Reading Room visual QA. */
export async function GET() {
  if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const paras = [
    "Computer science is the study of computers and computational systems. It involves the design, development and application of software, hardware and algorithms to solve real-world problems.",
    "Networks can be classified based on their size, purpose and architecture. A local area network connects devices within a building, while a wide area network spans cities or countries.",
    "The Transmission Control Protocol provides reliable, ordered delivery of a stream of bytes. Before data is exchanged, a three-way handshake establishes the connection.",
    "The User Datagram Protocol is connectionless. It offers lower latency but no guarantee of delivery, which suits real-time applications such as voice and video calls.",
  ];
  const titles = ["1. Introduction", "2. Computer Networks", "3. Transport Protocols", "4. Reliability", "5. Summary", "6. Review"];
  for (const [i, t] of titles.entries()) {
    const page = doc.addPage([595, 842]);
    page.drawText(t, { x: 60, y: 760, size: 22, font: bold, color: rgb(0.1, 0.1, 0.1) });
    let y = 720;
    for (let k = 0; k < 4; k++) {
      const words = paras[(i + k) % paras.length].split(" ");
      let line = "";
      for (const w of words) {
        if (font.widthOfTextAtSize(`${line} ${w}`, 13) > 470) {
          page.drawText(line.trim(), { x: 60, y, size: 13, font });
          y -= 19;
          line = "";
        }
        line += ` ${w}`;
      }
      page.drawText(line.trim(), { x: 60, y, size: 13, font });
      y -= 34;
    }
  }
  const bytes = await doc.save();
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" } });
}
