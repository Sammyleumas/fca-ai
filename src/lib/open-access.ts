import { NextResponse, type NextRequest } from "next/server";
import { isOpenAccessPath } from "@/lib/features";

/**
 * Accounts off: no sign-in, no Supabase calls. Account pages send people to the study
 * app instead of failing; account-only APIs answer with a clear JSON message.
 */
export function openAccess(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isOpenAccessPath(pathname)) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Accounts are turned off on this site." }, { status: 410 });
  }
  const target = request.nextUrl.clone();
  target.pathname = "/";
  target.search = "";
  return NextResponse.redirect(target);
}
