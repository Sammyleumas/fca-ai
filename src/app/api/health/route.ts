import { NextResponse } from "next/server";
import { isAIConfigured } from "@/lib/ai";
import { hasAdminClient, createAdminClient } from "@/lib/supabase/admin";
import { billingProviders } from "@/lib/billing/config";
import { emailConfigured } from "@/lib/email/send";
import { authDiagnostics, schemaDiagnostics } from "@/lib/supabase/diagnostics";

export const dynamic = "force-dynamic";

/** Liveness + configuration check. Never returns secrets, only booleans. */
export async function GET() {
  let database: "ok" | "error" | "unconfigured" = "unconfigured";
  if (hasAdminClient()) {
    const { error } = await createAdminClient().from("achievements").select("id", { head: true, count: "exact" }).limit(1);
    database = error ? "error" : "ok";
  }
  const [auth, schema] = await Promise.all([authDiagnostics(), schemaDiagnostics()]);
  const billing = billingProviders();
  const body = {
    status: database === "error" ? "degraded" : "ok",
    database,
    /** Supabase Auth as seen with the public key: reachable, and which sign-in methods are on. */
    auth,
    /** "ok" once supabase/setup.sql has been run; "not_set_up" if the app's tables are missing. */
    schema,
    ai: isAIConfigured(),
    email: emailConfigured(),
    billing: { stripe: billing.some((p) => p.id === "stripe"), paystack: billing.some((p) => p.id === "paystack") },
    cron: Boolean(process.env.CRON_SECRET),
  };
  return NextResponse.json(body, { status: database === "error" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
