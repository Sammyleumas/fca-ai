import "server-only";

export type BillingInterval = "month" | "year";
export type ProviderId = "stripe" | "paystack";

export type ProviderConfig = {
  id: ProviderId;
  label: string;
  currencyLabel: string;
  prices: Partial<Record<BillingInterval, { code: string; display: string | null }>>;
};

/** Providers are enabled only when their secret and at least one price/plan are configured. */
export function billingProviders(): ProviderConfig[] {
  const out: ProviderConfig[] = [];
  const env = process.env;
  if (env.PAYSTACK_SECRET_KEY && (env.PAYSTACK_PLAN_PREMIUM_MONTHLY || env.PAYSTACK_PLAN_PREMIUM_YEARLY)) {
    out.push({
      id: "paystack",
      label: "Paystack",
      currencyLabel: "Naira (cards, bank transfer, USSD)",
      prices: {
        ...(env.PAYSTACK_PLAN_PREMIUM_MONTHLY ? { month: { code: env.PAYSTACK_PLAN_PREMIUM_MONTHLY, display: env.PREMIUM_PRICE_LABEL_NGN_MONTHLY ?? null } } : {}),
        ...(env.PAYSTACK_PLAN_PREMIUM_YEARLY ? { year: { code: env.PAYSTACK_PLAN_PREMIUM_YEARLY, display: env.PREMIUM_PRICE_LABEL_NGN_YEARLY ?? null } } : {}),
      },
    });
  }
  if (env.STRIPE_SECRET_KEY && (env.STRIPE_PRICE_PREMIUM_MONTHLY || env.STRIPE_PRICE_PREMIUM_YEARLY)) {
    out.push({
      id: "stripe",
      label: "Stripe",
      currencyLabel: "International cards",
      prices: {
        ...(env.STRIPE_PRICE_PREMIUM_MONTHLY ? { month: { code: env.STRIPE_PRICE_PREMIUM_MONTHLY, display: env.PREMIUM_PRICE_LABEL_USD_MONTHLY ?? null } } : {}),
        ...(env.STRIPE_PRICE_PREMIUM_YEARLY ? { year: { code: env.STRIPE_PRICE_PREMIUM_YEARLY, display: env.PREMIUM_PRICE_LABEL_USD_YEARLY ?? null } } : {}),
      },
    });
  }
  return out;
}
