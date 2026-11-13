import { NextResponse } from "next/server";
import { hasAdminClient, createAdminClient } from "@/lib/supabase/admin";
import { billingProviders } from "@/lib/billing/config";
import { emailConfigured } from "@/lib/email/send";

export const dynamic = "force-dynamic";

/** Liveness + configuration check. Never returns secrets, only booleans. */
export async function GET() {
  let database: "ok" | "error" | "unconfigured" = "unconfigured";
  if (hasAdminClient()) {
    const { error } = await createAdminClient().from("achievements").select("id", { head: true, count: "exact" }).limit(1);
    database = error ? "error" : "ok";
  }
  const billing = billingProviders();
  const body = {
    status: database === "error" ? "degraded" : "ok",
    database,
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
    email: emailConfigured(),
    billing: { stripe: billing.some((p) => p.id === "stripe"), paystack: billing.some((p) => p.id === "paystack") },
    cron: Boolean(process.env.CRON_SECRET),
  };
  return NextResponse.json(body, { status: database === "error" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
