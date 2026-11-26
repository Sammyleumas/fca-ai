import type { NextRequest } from "next/server";
import { accountsEnabled } from "@/lib/features";
import { openAccess } from "@/lib/open-access";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Accounts off (the default): everyone goes straight into the study app.
  if (!accountsEnabled()) return openAccess(request);
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets and image optimisation.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mjs)$).*)",
  ],
};
