import "server-only";

const API = "https://api.stripe.com/v1";

/** Stripe REST (form-encoded). Keeps the app free of a billing SDK dependency. */
async function stripe<T>(method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, string>): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured.");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params && method !== "GET" ? new URLSearchParams(params).toString() : undefined,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${data.error?.message ?? "request failed"}`);
  return data;
}

export async function createStripeCheckout(opts: { priceId: string; userId: string; email: string | null; customerId: string | null; successUrl: string; cancelUrl: string }) {
  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": opts.priceId,
    "line_items[0][quantity]": "1",
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.userId,
    "metadata[user_id]": opts.userId,
    "subscription_data[metadata][user_id]": opts.userId,
    allow_promotion_codes: "true",
  };
  if (opts.customerId) params.customer = opts.customerId;
  else if (opts.email) params.customer_email = opts.email;
  const session = await stripe<{ url: string }>("POST", "/checkout/sessions", params);
  return session.url;
}

export async function createStripePortal(customerId: string, returnUrl: string) {
  const s = await stripe<{ url: string }>("POST", "/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
  return s.url;
}

export async function cancelStripeSubscription(subscriptionId: string) {
  await stripe("DELETE", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
}
