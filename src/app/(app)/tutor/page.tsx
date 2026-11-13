import type { Metadata } from "next";
import { TutorChat } from "@/components/tutor/chat";
import { TutorLayout } from "@/components/tutor/tutor-layout";
import { FormMessage } from "@/components/ui/feedback";
import { isAIConfigured } from "@/lib/ai";
import { displayName, requireOnboardedUser } from "@/lib/auth/dal";
import { listConversations } from "@/lib/data/tutor";

export const metadata: Metadata = { title: "AI Tutor" };

export default async function TutorPage({ searchParams }: PageProps<"/tutor">) {
  const { user, profile } = await requireOnboardedUser();
  const [sp, conversations] = await Promise.all([searchParams, listConversations(user.id)]);
  const q = typeof sp.q === "string" ? sp.q.slice(0, 2000) : undefined;
  return (
    <TutorLayout conversations={conversations}>
      {!isAIConfigured() && (
        <FormMessage tone="info" className="mb-4">
          AI features aren&apos;t configured on this server yet (missing <code>ANTHROPIC_API_KEY</code>).
        </FormMessage>
      )}
      <TutorChat key="new" initialMessages={[]} initialQuestion={q} name={displayName(profile, user.email)} />
    </TutorLayout>
  );
}
