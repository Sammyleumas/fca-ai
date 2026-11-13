import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  materialId: z.uuid(),
  currentPage: z.number().int().min(1).max(10000),
  scrollOffset: z.number().min(0).max(1),
  pagesRead: z.array(z.number().int().min(1).max(10000)).max(500),
  seconds: z.number().int().min(0).max(3600),
});

/**
 * Saves reading position, pages read and active time. Accepts JSON or text/plain
 * bodies so it also works with navigator.sendBeacon() when the tab closes.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  let body: z.infer<typeof schema>;
  try {
    const parsed = schema.safeParse(JSON.parse(await request.text()));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("check_rate_limit", { p_key: "reader:progress", p_limit: 40, p_window_seconds: 60 });
  if (allowed === false) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { data, error } = await supabase.rpc("save_reading_progress", {
    p_material_id: body.materialId,
    p_current_page: body.currentPage,
    p_scroll_offset: body.scrollOffset,
    p_pages_read: body.pagesRead,
    p_seconds: body.seconds,
  });
  if (error) return NextResponse.json({ error: "Could not save progress" }, { status: 400 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
