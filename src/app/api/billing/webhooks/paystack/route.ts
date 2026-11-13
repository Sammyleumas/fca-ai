import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { applySubscriptionUpdate, claimEvent, finishEvent } from "@/lib/billing/service";
import { paystackEventToUpdate, verifyPaystackSignature } from "@/lib/billing/webhooks";
import { createAdminClient } from "@/lib/supabase/admin";

/** Paystack webhook: HMAC-SHA512 verified, processed once. */
export async function POST(request: NextRequest) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const raw = await request.text();
  if (!verifyPaystackSignature(raw, request.headers.get("x-paystack-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  const event = JSON.parse(raw) as { event: string; data: Record<string, unknown> };
  // Paystack events have no id; derive a stable one from the payload.
  const eventId = `${event.event}:${(event.data.id as string | number | undefined) ?? createHash("sha256").update(raw).digest("hex")}`;
  if (!(await claimEvent("paystack", eventId, event.event))) return NextResponse.json({ received: true, duplicate: true });
  try {
    const when = (event.data.paid_at ?? event.data.updatedAt ?? event.data.createdAt) as string | undefined;
    const update = paystackEventToUpdate(event);
    const userId = update ? await applySubscriptionUpdate("paystack", update, when ? new Date(when) : new Date()) : null;
    await finishEvent("paystack", eventId, userId, update && !userId ? "no matching student" : undefined);
    return NextResponse.json({ received: true });
  } catch (e) {
    await createAdminClient().from("billing_events").delete().eq("provider", "paystack").eq("event_id", eventId);
    return NextResponse.json({ error: e instanceof Error ? "Processing failed" : "error" }, { status: 500 });
  }
}
