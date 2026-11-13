import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST-only sign out (prevents CSRF-able GET logouts and link prefetching). */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const target = request.nextUrl.clone();
  target.pathname = "/login";
  target.search = "?signed_out=1";
  return NextResponse.redirect(target, { status: 303 });
}
