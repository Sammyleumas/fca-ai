import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/dal";
import { processPendingJobs } from "@/lib/materials/worker";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const TERMINAL = new Set(["ready", "failed"]);

/**
 * Status polling for materials being processed. Also nudges the worker for this
 * student so processing continues even without a cron schedule.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const ids = z
    .array(z.uuid())
    .max(100)
    .safeParse((request.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean));
  if (!ids.success || !ids.data.length) return NextResponse.json({ materials: [] });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .select("id, status, status_detail, processing_progress, processing_error, page_count")
    .in("id", ids.data);
  if (error) return NextResponse.json({ error: "Could not load status" }, { status: 500 });

  if ((data ?? []).some((m) => !TERMINAL.has(m.status as string) && m.status !== "uploaded")) {
    after(() => processPendingJobs({ userId: user.id, budgetMs: 50_000 }).catch(() => undefined));
  }
  return NextResponse.json({ materials: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
