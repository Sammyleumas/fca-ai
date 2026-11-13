import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

/** Redirects to a short-lived signed URL for the student's original file. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/materials/[id]/file">) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = await createClient();
  const { data: material } = await supabase
    .from("materials")
    .select("storage_path, original_filename, status")
    .eq("id", id)
    .maybeSingle();
  if (!material || material.status === "uploaded") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const inline = request.nextUrl.searchParams.get("inline") === "1";
  const { data, error } = await supabase.storage
    .from("materials")
    .createSignedUrl(material.storage_path, 300, inline ? undefined : { download: material.original_filename });
  if (error || !data) return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "Cache-Control": "no-store" } });
}
