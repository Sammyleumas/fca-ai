/** Route groups used by the proxy for optimistic redirects. */
export const AUTH_ROUTES = ["/login", "/signup", "/forgot-password"] as const;
export const PUBLIC_ROUTES = ["/", "/verify-email", "/reset-password", "/auth", "/legal", "/setup-required"] as const;

export function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

export function isPublicRoute(pathname: string) {
  if (pathname === "/") return true;
  return [...PUBLIC_ROUTES, ...AUTH_ROUTES].some((r) => r !== "/" && (pathname === r || pathname.startsWith(`${r}/`)));
}

/** Only allow same-origin relative redirects (prevents open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
