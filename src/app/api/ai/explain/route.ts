import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AIError, AI_ERROR_STATUS, getAIProvider } from "@/lib/ai";
import { assertAIAllowed, recordAIUsage } from "@/lib/ai/guard";
import { PASSAGE_ACTIONS, PASSAGE_SYSTEM_PROMPT, passageUserPrompt, type PassageAction } from "@/lib/ai/prompts/passage";
import { getSessionUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const schema = z.object({
  materialId: z.uuid(),
  page: z.number().int().min(1).max(10000),
  action: z.enum(Object.keys(PASSAGE_ACTIONS) as [PassageAction, ...PassageAction[]]),
  selection: z.string().trim().max(4000).optional(),
  question: z.string().trim().max(1000).optional(),
});


/** Streams an explanation / summary / examples / questions for a passage the student selected. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const body = parsed.data;
  if (body.action === "ask" && !body.question) return NextResponse.json({ error: "Type your question." }, { status: 400 });

  let provider;
  try {
    provider = getAIProvider();
    await assertAIAllowed(user.id, "explain");
  } catch (error) {
    if (error instanceof AIError) return NextResponse.json({ error: error.message }, { status: AI_ERROR_STATUS[error.code] ?? 500 });
    return NextResponse.json({ error: "The AI assistant is unavailable right now." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: material } = await supabase.from("materials").select("id, title, status").eq("id", body.materialId).maybeSingle();
  if (!material || material.status !== "ready") return NextResponse.json({ error: "Material not found." }, { status: 404 });

  // Context comes from the stored text, not from the browser.
  let from = body.page;
  let to = body.page;
  if (body.action === "summarise" && !body.selection) {
    const { data: sec } = await supabase
      .from("document_sections")
      .select("start_page, end_page")
      .eq("material_id", material.id)
      .lte("start_page", body.page)
      .gte("end_page", body.page)
      .order("level", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sec) {
      from = sec.start_page;
      to = Math.min(sec.end_page, sec.start_page + 5);
    }
  } else {
    to = body.page + 1;
  }
  const { data: pages } = await supabase
    .from("material_pages")
    .select("page_number, content")
    .eq("material_id", material.id)
    .gte("page_number", from)
    .lte("page_number", to)
    .order("page_number");
  const context = (pages ?? []).map((p) => `[page ${p.page_number}]\n${p.content}`).join("\n\n").slice(0, 14000);

  const stream = provider.streamText({
    system: PASSAGE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: passageUserPrompt({
          action: body.action,
          materialTitle: material.title,
          page: body.page,
          selection: body.selection || null,
          context,
          question: body.question,
        }),
      },
    ],
    maxTokens: 2500,
    effort: "low",
    signal: request.signal,
  });
  const encoder = new TextEncoder();
  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream.textStream) controller.enqueue(encoder.encode(chunk));
        const { usage } = await stream.final();
        await recordAIUsage(user.id, "explain", usage);
      } catch (error) {
        const message = error instanceof AIError ? error.message : "The AI assistant stopped unexpectedly.";
        controller.enqueue(encoder.encode(`\n\n[[error:${message}]]`));
      }
      controller.close();
    },
  });
  return new Response(out, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
