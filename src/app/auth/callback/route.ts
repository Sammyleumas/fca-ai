import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/routes";

/** OAuth (PKCE) callback. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const target = request.nextUrl.clone();
  target.search = "";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      target.pathname = next;
      return NextResponse.redirect(target);
    }
  }
  target.pathname = "/login";
  target.searchParams.set("error", "oauth_failed");
  return NextResponse.redirect(target);
}
