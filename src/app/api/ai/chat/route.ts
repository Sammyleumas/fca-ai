import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AIError, AI_ERROR_STATUS, getAIProvider, type ChatMessage } from "@/lib/ai";
import { assertAIAllowed, recordAIUsage } from "@/lib/ai/guard";
import { tutorSystemPrompt } from "@/lib/ai/prompts/tutor";
import { groundedTutorSystemPrompt, groundedUserTurn } from "@/lib/ai/prompts/grounded-tutor";
import { extractCitations, retrievePassages, type Passage } from "@/lib/ai/retrieval";
import { displayName, getProfile, getSessionUser } from "@/lib/auth/dal";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

const bodySchema = z.object({
  conversationId: z.uuid().optional(),
  materialId: z.uuid().optional(),
  sectionId: z.uuid().optional(),
  message: z.string().trim().min(1, "Type a message.").max(4000, "Keep messages under 4,000 characters."),
});

function errorJson(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * General AI tutor chat (streamed). The student's message is saved before the model
 * is called, so a failed AI request never loses what they wrote.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return errorJson("Please sign in again.", 401);

  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
    body = parsed.data;
  } catch {
    return errorJson("Invalid request.", 400);
  }

  if (!hasAdminClient()) return errorJson("The AI tutor is not configured on this server yet.", 503);

  let provider;
  try {
    provider = getAIProvider();
    await assertAIAllowed(user.id, "tutor_chat");
  } catch (error) {
    if (error instanceof AIError) return errorJson(error.message, AI_ERROR_STATUS[error.code] ?? 500);
    return errorJson("The AI tutor is unavailable right now.", 503);
  }

  const supabase = await createClient();

  // Resolve or create the conversation (RLS guarantees ownership).
  let conversationId = body.conversationId;
  let mode: "general" | "grounded" = "general";
  let materialId: string | null = null;
  let sectionId: string | null = null;
  if (conversationId) {
    const { data } = await supabase
      .from("ai_conversations")
      .select("id, mode, material_id, section_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!data) return errorJson("Conversation not found.", 404);
    mode = data.mode;
    materialId = data.material_id;
    sectionId = data.section_id;
  } else {
    if (body.materialId) {
      const { data: m } = await supabase.from("materials").select("id, status").eq("id", body.materialId).maybeSingle();
      if (!m) return errorJson("Material not found.", 404);
      if (m.status !== "ready") return errorJson("This material is still being processed.", 409);
      mode = "grounded";
      materialId = m.id;
      if (body.sectionId) {
        const { data: sec } = await supabase
          .from("document_sections")
          .select("id")
          .eq("id", body.sectionId)
          .eq("material_id", m.id)
          .maybeSingle();
        sectionId = sec?.id ?? null;
      }
    }
    const title = body.message.replace(/\s+/g, " ").slice(0, 80);
    const { data, error } = await supabase
      .from("ai_conversations")
      .insert({ user_id: user.id, mode, material_id: materialId, section_id: sectionId, title })
      .select("id")
      .single();
    if (error || !data) return errorJson("Could not start a conversation.", 500);
    conversationId = data.id as string;
  }

  const { error: insertError } = await supabase
    .from("ai_messages")
    .insert({ conversation_id: conversationId, user_id: user.id, role: "user", content: body.message });
  if (insertError) return errorJson("Could not save your message.", 500);

  const { data: history } = await supabase
    .from("ai_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);
  const messages: ChatMessage[] = ((history ?? []) as ChatMessage[]).reverse();
  // Conversations must start with a student turn.
  while (messages.length && messages[0].role !== "user") messages.shift();

  const profile = await getProfile(user.id);
  const who = { name: displayName(profile, user.email), educationLevel: profile?.education_level ?? null };
  let system = tutorSystemPrompt(who);
  let passages: Passage[] = [];
  if (mode === "grounded" && materialId) {
    let section: { materialId: string; start: number; end: number } | null = null;
    let sectionTitle: string | null = null;
    if (sectionId) {
      const { data: sec } = await supabase.from("document_sections").select("title, start_page, end_page").eq("id", sectionId).maybeSingle();
      if (sec) {
        section = { materialId, start: sec.start_page, end: sec.end_page };
        sectionTitle = sec.title;
      }
    }
    passages = await retrievePassages({ materialIds: [materialId], query: body.message, section });
    system = groundedTutorSystemPrompt(who);
    // Only the latest question carries sources; earlier turns stay as plain history.
    messages[messages.length - 1] = { role: "user", content: groundedUserTurn(body.message, passages, { sectionTitle }) };
  }

  // Count the question as study activity (no streak credit; small XP).
  await supabase.rpc("record_study_activity", { p_kind: "ai_question", p_minutes: 0 });

  const stream = provider.streamText({ system, messages, maxTokens: 4000, effort: "medium", signal: request.signal });
  const encoder = new TextEncoder();
  const admin = createAdminClient();
  const convId = conversationId;

  const body$ = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream.textStream) controller.enqueue(encoder.encode(chunk));
        const { text, usage, stopReason } = await stream.final();
        if (stopReason === "refusal" && !text.trim()) {
          controller.enqueue(encoder.encode("I can't help with that request, but I'm happy to help you study something else."));
        }
        const citations = extractCitations(text, passages);
        if (text.trim()) {
          await admin.from("ai_messages").insert({
            conversation_id: convId,
            user_id: user.id,
            role: "assistant",
            content: text,
            citations,
            model: usage.model,
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
          });
          await admin.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
        }
        await recordAIUsage(user.id, "tutor_chat", usage);
        if (citations.length) controller.enqueue(encoder.encode(`\n[[citations:${JSON.stringify(citations)}]]`));
        controller.close();
      } catch (error) {
        const message = error instanceof AIError ? error.message : "The AI tutor stopped unexpectedly.";
        controller.enqueue(encoder.encode(`\n\n[[error:${message}]]`));
        controller.close();
      }
    },
  });

  return new Response(body$, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Conversation-Id": convId,
      "X-Conversation-Mode": mode,
    },
  });
}
