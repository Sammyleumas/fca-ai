import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthRoute, isPublicRoute } from "@/lib/routes";

/**
 * Refreshes the Supabase session cookie and performs optimistic redirects.
 * This is NOT the security boundary — pages, actions and RLS re-verify access.
 */
export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  if (!url || !key) return response; // Not configured: pages render a setup notice.

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        if (headers) for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
      },
    },
  });

  // Must run before any response is produced so refreshed tokens are persisted.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  const redirect = (to: string) => {
    const target = request.nextUrl.clone();
    const [path, query] = to.split("?");
    target.pathname = path;
    target.search = query ? `?${query}` : "";
    const res = NextResponse.redirect(target);
    for (const c of response.cookies.getAll()) res.cookies.set(c);
    return res;
  };

  if (!signedIn && !isPublicRoute(pathname) && !pathname.startsWith("/api/")) {
    return redirect(`/login?next=${encodeURIComponent(pathname + search)}`);
  }
  if (signedIn && (isAuthRoute(pathname) || pathname === "/")) {
    return redirect("/dashboard");
  }
  return response;
}
