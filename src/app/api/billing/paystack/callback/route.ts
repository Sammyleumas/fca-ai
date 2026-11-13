import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/dal";
import { verifyPaystackTransaction } from "@/lib/billing/providers/paystack";
import { applySubscriptionUpdate } from "@/lib/billing/service";
import { paystackEventToUpdate } from "@/lib/billing/webhooks";
import { paystackPlanCodes } from "@/lib/billing/config";

/**
 * Paystack redirects here after checkout. The transaction is verified with
 * Paystack's API (server-to-server) before anything changes; the webhook is the
 * other, independent path. A redirect alone never grants Premium.
 */
export async function GET(request: NextRequest) {
  const target = request.nextUrl.clone();
  target.pathname = "/settings/billing";
  target.search = "";
  const user = await getSessionUser();
  const reference = request.nextUrl.searchParams.get("reference") ?? request.nextUrl.searchParams.get("trxref");
  if (!user || !reference || reference.length > 200) {
    target.searchParams.set("status", "failed");
    return NextResponse.redirect(target);
  }
  try {
    const tx = await verifyPaystackTransaction(reference);
    const meta = (typeof tx.metadata === "string" ? JSON.parse(tx.metadata) : tx.metadata) as { user_id?: string } | null;
    if (tx.status !== "success" || meta?.user_id !== user.id) {
      target.searchParams.set("status", "failed");
      return NextResponse.redirect(target);
    }
    const update = paystackEventToUpdate({ event: "charge.success", data: { ...tx, plan: tx.plan_object ?? tx.plan } }, paystackPlanCodes());
    if (update) await applySubscriptionUpdate("paystack", { ...update, userId: user.id }, tx.paid_at ? new Date(tx.paid_at) : new Date());
    // Verified, but not a payment for one of our Premium plans: nothing changes.
    target.searchParams.set("status", update ? "success" : "failed");
  } catch {
    target.searchParams.set("status", "processing");
  }
  return NextResponse.redirect(target);
}
