/**
 * Accounts (sign-in, sign-up, guest sessions and everything stored in Supabase) are
 * OFF unless NEXT_PUBLIC_ACCOUNTS_ENABLED is "true". With accounts off, everyone can use
 * the study app at "/study" (the landing page is "/"), which needs no database and keeps work in the
 * visitor's browser. The account code is kept, switched off, so it can return later.
 */
export function accountsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === "true";
}

/** Routes that work without accounts: the study app, legal pages and its own APIs. */
export function isOpenAccessPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "/study" || pathname === "/try") return true;
  return ["/legal/", "/api/try/", "/dev-preview/"].some((p) => pathname.startsWith(p)) || pathname === "/api/health";
}
