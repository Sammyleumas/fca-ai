import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { TutorChat, type UIMessage } from "@/components/tutor/chat";
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
    supabase.from("ai_conversations").select("id").eq("id", id).maybeSingle(),
    supabase.from("ai_messages").select("id, role, content").eq("conversation_id", id).order("created_at").limit(200),
    listConversations(user.id),
  ]);
  if (!conv.data) notFound();
  return (
    <TutorLayout conversations={conversations} activeId={id}>
      <TutorChat key={id} conversationId={id} initialMessages={(msgs.data ?? []) as UIMessage[]} name={displayName(profile, user.email)} />
    </TutorLayout>
  );
}
