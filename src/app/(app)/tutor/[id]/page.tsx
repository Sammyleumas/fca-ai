import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { TutorChat, type TutorContext, type UIMessage } from "@/components/tutor/chat";
import { TutorLayout } from "@/components/tutor/tutor-layout";
import { displayName, requireOnboardedUser } from "@/lib/auth/dal";
import { listConversations } from "@/lib/data/tutor";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "AI Tutor" };

export default async function ConversationPage({ params }: PageProps<"/tutor/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { user, profile } = await requireOnboardedUser();
  const supabase = await createClient();
  const [conv, msgs, conversations] = await Promise.all([
    supabase
      .from("ai_conversations")
      .select("id, mode, material_id, section_id, materials(title), document_sections(title)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("ai_messages").select("id, role, content, citations").eq("conversation_id", id).order("created_at").limit(200),
    listConversations(user.id),
  ]);
  if (!conv.data) notFound();
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? (v[0] ?? null) : v);
  const material = one(conv.data.materials as { title: string } | { title: string }[] | null);
  const section = one(conv.data.document_sections as { title: string } | { title: string }[] | null);
  const context: TutorContext =
    conv.data.mode === "grounded" && conv.data.material_id
      ? { materialId: conv.data.material_id, materialTitle: material?.title ?? "your material", sectionId: conv.data.section_id, sectionTitle: section?.title ?? null }
      : null;
  return (
    <TutorLayout conversations={conversations} activeId={id}>
      <TutorChat key={id} conversationId={id} initialMessages={(msgs.data ?? []) as UIMessage[]} name={displayName(profile, user.email)} context={context} />
    </TutorLayout>
  );
}
