import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

/** Short-lived signed URL for the in-app PDF reader (fetched by PDF.js with range requests). */
export async function GET(_: Request, { params }: RouteContext<"/api/materials/[id]/url">) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await createClient();
  const { data: m } = await supabase.from("materials").select("storage_path, status").eq("id", id).maybeSingle();
  if (!m || m.status === "uploaded") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data, error } = await supabase.storage.from("materials").createSignedUrl(m.storage_path, 60 * 60);
  if (error || !data) return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  return NextResponse.json({ url: data.signedUrl }, { headers: { "Cache-Control": "no-store" } });
}
