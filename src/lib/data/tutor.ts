import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ConversationSummary } from "@/components/tutor/tutor-layout";

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_conversations")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(30);
  return (data ?? []) as ConversationSummary[];
}
