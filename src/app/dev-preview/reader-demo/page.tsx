import { notFound } from "next/navigation";
import { DEFAULT_PREFS, type ReaderData } from "@/lib/data/reader";
import { DemoReader } from "./demo-reader";

/** DEVELOPMENT-ONLY Reading Room preview. ?type=text shows the DOCX/TXT renderer. */
export default async function ReaderDemo({ searchParams }: PageProps<"/dev-preview/reader-demo">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const sp = await searchParams;
  const text = sp.type === "text";
  const sections = [
    { id: "c1", parent_id: null, level: 1, position: 0, title: "Introduction", start_page: 1, end_page: 1 },
    { id: "c2", parent_id: null, level: 1, position: 1, title: "Computer Networks", start_page: 2, end_page: 3 },
    { id: "u1", parent_id: "c2", level: 3, position: 0, title: "Network types", start_page: 2, end_page: 2 },
    { id: "u2", parent_id: "c2", level: 3, position: 1, title: "TCP and UDP", start_page: 3, end_page: 3 },
    { id: "c3", parent_id: null, level: 1, position: 2, title: "Reliability & review", start_page: 4, end_page: 6 },
  ];
  const para = "Computer science is the study of computers and computational systems. It involves the design, development and application of software, hardware and algorithms to solve real-world problems.\n\nNetworks can be classified based on their size, purpose and architecture. A local area network connects devices within a building, while a wide area network spans cities or countries.";
  const data: ReaderData = {
    material: { id: "demo", title: "Introduction to Computer Science", file_type: text ? "docx" : "pdf", page_count: 6, pages_are_estimated: text },
    sections,
    progress: { current_page: 1, scroll_offset: 0, percent: 17, pages_read: [1], completed_section_ids: [], total_seconds: 600 },
    highlights: text ? [{ id: "h1", page_number: 1, text: "Computer science is the study", color: "lime", anchor: { type: "text", start: 0, end: 29 }, created_at: "" }] : [],
    notes: [{ id: "n1", page_number: 1, highlight_id: null, title: null, body: "Remember: CS = theory + practice.", updated_at: "" }],
    bookmarks: [],
    pages: text ? Array.from({ length: 6 }, (_, i) => ({ page: i + 1, content: `${i + 1}. Section heading\n\n${para}\n\n${para}` })) : null,
    prefs: { ...DEFAULT_PREFS },
  };
  return <DemoReader data={data} />;
}
