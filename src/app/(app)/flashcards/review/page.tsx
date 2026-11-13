import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { FlashcardReview, type ReviewCard } from "@/components/flashcards/review";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { GlassCard } from "@/components/ui/glass-card";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Review flashcards" };

export default async function ReviewPage({ searchParams }: PageProps<"/flashcards/review">) {
  const { user } = await requireOnboardedUser();
  const sp = await searchParams;
  const material = typeof sp.material === "string" ? sp.material : null;
  const ahead = sp.ahead === "1";
  const supabase = await createClient();
  let q = supabase
    .from("flashcards")
    .select("id, front, back, explanation, source_page, material_id, origin, materials(title)")
    .eq("user_id", user.id)
    .eq("suspended", false)
    .order("due_at")
    .limit(50);
  if (!ahead) q = q.lte("due_at", new Date().toISOString());
  if (material === "none") q = q.is("material_id", null);
  else if (material && z.uuid().safeParse(material).success) q = q.eq("material_id", material);
  const { data } = await q;
  const cards: ReviewCard[] = (data ?? []).map((c) => {
    const m = Array.isArray(c.materials) ? c.materials[0] : c.materials;
    return { ...c, materialTitle: (m as { title: string } | null)?.title ?? null } as ReviewCard;
  });
  const title = cards[0]?.materialTitle && material ? cards[0].materialTitle : ahead ? "Practice ahead" : "Due cards";

  if (!cards.length) {
    return (
      <GlassCard className="mx-auto max-w-md">
        <EmptyState
          icon={<CheckCircle2 className="size-6" />}
          title="You're up to date"
          description="No cards are due right now. Come back later — or practise ahead."
          action={
            <div className="flex gap-2">
              <Link href={`/flashcards/review?ahead=1${material ? `&material=${material}` : ""}`} className={buttonClasses({ size: "sm" })}>Practise ahead</Link>
              <Link href="/flashcards" className={buttonClasses({ size: "sm", variant: "secondary" })}>Flashcards</Link>
            </div>
          }
        />
      </GlassCard>
    );
  }
  return <FlashcardReview cards={cards} title={title} />;
}
