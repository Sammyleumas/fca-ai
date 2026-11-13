import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AIError, getAIProvider } from "@/lib/ai";
import { assertAIAllowed, recordAIUsage } from "@/lib/ai/guard";
import { FLASHCARD_SYSTEM_PROMPT } from "@/lib/ai/prompts/assessment";
import { loadExcerpts } from "@/lib/assessments/sources";
import { getSessionUser } from "@/lib/auth/dal";
import { limitsFor } from "@/lib/billing/plans";
import { getShellData } from "@/lib/data/shell";
import { computeLeaves, type SectionRow } from "@/lib/materials/segmentation";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

const schema = z.object({ materialId: z.uuid(), sectionIds: z.array(z.uuid()).max(30).optional(), count: z.number().int().min(5).max(40) });
const outSchema = z.object({
  cards: z.array(z.object({ front: z.string(), back: z.string(), explanation: z.string(), source_page: z.number().int(), kind: z.enum(["definition", "concept"]) })),
});

/** Generates flashcards from a material's sections, validated against the pages provided. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const body = parsed.data;
  const supabase = await createClient();

  let provider;
  try {
    provider = getAIProvider();
    await assertAIAllowed(user.id, "flashcards");
  } catch (e) {
    if (e instanceof AIError) return NextResponse.json({ error: e.message }, { status: e.code === "not_configured" ? 503 : 429 });
    return NextResponse.json({ error: "Flashcard generation is unavailable right now." }, { status: 503 });
  }

  const { data: m } = await supabase.from("materials").select("id, title, status, page_count").eq("id", body.materialId).maybeSingle();
  if (!m || m.status !== "ready") return NextResponse.json({ error: "Material not ready." }, { status: 404 });
  const { plan } = await getShellData(user.id);
  const { count: existing } = await supabase.from("flashcards").select("id", { count: "exact", head: true }).eq("material_id", m.id).neq("origin", "manual");
  const room = limitsFor(plan).flashcardsPerMaterial - (existing ?? 0);
  if (room <= 0) return NextResponse.json({ error: `You've reached the ${limitsFor(plan).label} plan's AI flashcard limit for this material.` }, { status: 429 });

  const { data: secs } = await supabase.from("document_sections").select("id, parent_id, level, position, title, start_page, end_page").eq("material_id", m.id).limit(5000);
  const all = (secs ?? []) as SectionRow[];
  const chosen: { id: string; title: string; start_page: number; end_page: number }[] = body.sectionIds?.length ? all.filter((s) => body.sectionIds!.includes(s.id)) : computeLeaves(all);
  const ranges = (chosen.length ? chosen.slice(0, 12) : [{ id: null as unknown as string, title: m.title, start_page: 1, end_page: m.page_count ?? 1 }]).map((s) => ({
    materialId: m.id, sectionId: s.id ?? null, title: s.title, start: s.start_page, end: s.end_page,
  }));
  const excerpts = await loadExcerpts(ranges, 36_000);
  if (!excerpts.length) return NextResponse.json({ error: "No readable text in these sections." }, { status: 400 });

  try {
    const want = Math.min(body.count, room);
    const body$ = excerpts
      .map((e) => `<excerpt page="${e.page}"${e.sectionTitle ? ` section="${e.sectionTitle.replace(/"/g, "'")}"` : ""}>\n${e.text.replace(/<\/?excerpt[^>]*>/gi, "")}\n</excerpt>`)
      .join("\n");
    const { object, usage } = await provider.generateObject({
      system: FLASHCARD_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `${body$}\n\nCreate ${want} flashcards.` }],
      schema: outSchema,
      maxTokens: 8000,
      effort: "low",
    });
    await recordAIUsage(user.id, "flashcards", usage);
    const byPage = new Map(excerpts.map((e) => [e.page, e]));
    const seen = new Set<string>();
    const rows = object.cards
      .filter((c) => byPage.has(c.source_page) && c.front.trim() && c.back.trim())
      .filter((c) => {
        const k = c.front.trim().toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, want)
      .map((c) => ({
        user_id: user.id,
        material_id: m.id,
        section_id: byPage.get(c.source_page)!.sectionId,
        origin: c.kind,
        front: c.front.trim().slice(0, 2000),
        back: c.back.trim().slice(0, 4000),
        explanation: c.explanation.trim().slice(0, 4000) || null,
        source_page: c.source_page,
      }));
    if (!rows.length) return NextResponse.json({ error: "We couldn't create reliable cards from these pages." }, { status: 422 });
    const { error } = await supabase.from("flashcards").insert(rows);
    if (error) return NextResponse.json({ error: "Could not save the cards." }, { status: 500 });
    return NextResponse.json({ created: rows.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof AIError ? e.message : "Flashcard generation failed." }, { status: 502 });
  }
}
