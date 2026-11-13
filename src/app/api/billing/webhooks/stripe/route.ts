import { NextResponse, type NextRequest } from "next/server";
import { applySubscriptionUpdate, claimEvent, finishEvent } from "@/lib/billing/service";
import { stripeEventToUpdate, verifyStripeSignature } from "@/lib/billing/webhooks";

/** Stripe webhook: signature-verified, processed once, order-safe. */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const raw = await request.text();
  if (!verifyStripeSignature(raw, request.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  const event = JSON.parse(raw) as { id: string; type: string; created: number; data: { object: unknown } };
  if (!(await claimEvent("stripe", event.id, event.type))) return NextResponse.json({ received: true, duplicate: true });
  try {
    const update = stripeEventToUpdate(event);
    const userId = update ? await applySubscriptionUpdate("stripe", update, new Date(event.created * 1000)) : null;
    await finishEvent("stripe", event.id, userId, update && !userId ? "no matching student" : undefined);
    return NextResponse.json({ received: true });
  } catch (e) {
    await finishEvent("stripe", event.id, null, e instanceof Error ? e.message : "error");
    // 500 asks Stripe to retry; the ledger row is removed so the retry is processed.
    const { createAdminClient } = await import("@/lib/supabase/admin");
    await createAdminClient().from("billing_events").delete().eq("provider", "stripe").eq("event_id", event.id);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
