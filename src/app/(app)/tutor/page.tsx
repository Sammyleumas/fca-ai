import type { Metadata } from "next";
import { z } from "zod";
import { TutorChat, type TutorContext } from "@/components/tutor/chat";
import { ContextPicker } from "@/components/tutor/context-picker";
import { TutorLayout } from "@/components/tutor/tutor-layout";
import { FormMessage } from "@/components/ui/feedback";
import { isAIConfigured } from "@/lib/ai";
import { displayName, requireOnboardedUser } from "@/lib/auth/dal";
import { listConversations } from "@/lib/data/tutor";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "AI Tutor" };

export default async function TutorPage({ searchParams }: PageProps<"/tutor">) {
  const { user, profile } = await requireOnboardedUser();
  const supabase = await createClient();
  const [sp, conversations, mats] = await Promise.all([
    searchParams,
    listConversations(user.id),
    supabase.from("materials").select("id, title").eq("user_id", user.id).eq("status", "ready").order("title"),
  ]);
  const q = typeof sp.q === "string" ? sp.q.slice(0, 2000) : undefined;
  const materials = (mats.data ?? []) as { id: string; title: string }[];
  const materialId = typeof sp.material === "string" && z.uuid().safeParse(sp.material).success ? sp.material : null;
  const material = materials.find((m) => m.id === materialId) ?? null;

  let context: TutorContext = null;
  if (material) {
    let sectionTitle: string | null = null;
    let sectionId: string | null = null;
    if (typeof sp.section === "string" && z.uuid().safeParse(sp.section).success) {
      const { data } = await supabase.from("document_sections").select("id, title").eq("id", sp.section).eq("material_id", material.id).maybeSingle();
      sectionId = data?.id ?? null;
      sectionTitle = data?.title ?? null;
    }
    context = { materialId: material.id, materialTitle: material.title, sectionId, sectionTitle };
  }

  return (
    <TutorLayout conversations={conversations}>
      {!isAIConfigured() && (
        <FormMessage tone="info" className="mb-4">
          AI features aren&apos;t configured on this server yet (missing <code>ANTHROPIC_API_KEY</code>).
        </FormMessage>
      )}
      {materials.length > 0 && <ContextPicker materials={materials} value={material?.id ?? null} />}
      <TutorChat key={`new-${material?.id ?? "general"}-${context?.sectionId ?? ""}`} initialMessages={[]} initialQuestion={q} name={displayName(profile, user.email)} context={context} />
    </TutorLayout>
  );
}
