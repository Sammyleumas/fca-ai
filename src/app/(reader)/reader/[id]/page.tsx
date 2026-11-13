import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Reader, type ReaderTask } from "@/components/reader/reader";
import { isAIConfigured } from "@/lib/ai";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { getReaderData } from "@/lib/data/reader";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reading Room" };

export default async function ReaderPage({ params, searchParams }: PageProps<"/reader/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [{ user, profile }, sp] = await Promise.all([requireOnboardedUser(), searchParams]);
  const data = await getReaderData(user.id, id, profile.reading_prefs);
  if (!data) {
    // Still processing (or failed): the material page explains what's happening.
    const supabase = await createClient();
    const { data: exists } = await supabase.from("materials").select("id").eq("id", id).maybeSingle();
    if (exists) redirect(`/library/${id}`);
    notFound();
  }

  let task: ReaderTask | null = null;
  if (typeof sp.task === "string" && z.uuid().safeParse(sp.task).success) {
    const supabase = await createClient();
    const { data: t } = await supabase
      .from("study_tasks")
      .select("id, title, start_page, end_page, status, session_id, material_id")
      .eq("id", sp.task)
      .maybeSingle();
    if (t && t.material_id === id) task = t as ReaderTask;
  }
  const pageParam = typeof sp.page === "string" ? Number.parseInt(sp.page, 10) : NaN;
  const initialPage = Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : (task?.start_page ?? undefined);

  return (
    <Reader
      data={data}
      initialPage={initialPage}
      task={task}
      backHref={task ? `/planner/sessions/${task.session_id}` : `/library/${id}`}
      aiEnabled={isAIConfigured()}
    />
  );
}
