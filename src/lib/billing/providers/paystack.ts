import "server-only";

const API = "https://api.paystack.co";

async function paystack<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Paystack is not configured.");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
  if (!res.ok || !data.status) throw new Error(`Paystack ${res.status}: ${data.message ?? "request failed"}`);
  return data.data as T;
}

/** Starts a subscription checkout. The plan's amount is read from Paystack, never from the client. */
export async function createPaystackCheckout(opts: { planCode: string; userId: string; email: string; callbackUrl: string }) {
  const plan = await paystack<{ amount: number; currency: string }>("GET", `/plan/${encodeURIComponent(opts.planCode)}`);
  const tx = await paystack<{ authorization_url: string; reference: string }>("POST", "/transaction/initialize", {
    email: opts.email,
    amount: String(plan.amount),
    plan: opts.planCode,
    callback_url: opts.callbackUrl,
    metadata: { user_id: opts.userId, plan_code: opts.planCode },
  });
  return tx.authorization_url;
}

export type PaystackTransaction = {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  paid_at: string | null;
  metadata: unknown;
  plan: unknown;
  plan_object?: { plan_code?: string; interval?: string };
  customer: { customer_code: string; email: string };
};

export function verifyPaystackTransaction(reference: string) {
  return paystack<PaystackTransaction>("GET", `/transaction/verify/${encodeURIComponent(reference)}`);
}

export async function paystackManageLink(subscriptionCode: string) {
  const d = await paystack<{ link: string }>("GET", `/subscription/${encodeURIComponent(subscriptionCode)}/manage/link`);
  return d.link;
}

export async function disablePaystackSubscription(code: string, token: string) {
  await paystack("POST", "/subscription/disable", { code, token });
}
