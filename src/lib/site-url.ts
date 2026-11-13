import "server-only";
import { headers } from "next/headers";

/** Absolute origin used for auth email redirects. Prefers the configured site URL. */
export async function siteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/^["']|["']$/g, "");
  // Ignore a malformed value (e.g. missing "https://") rather than sending broken email links.
  if (configured && /^https?:\/\/[^\s/]+/i.test(configured)) return configured.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
