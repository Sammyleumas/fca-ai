"use client";

import { useState, useTransition } from "react";
import { CreditCard, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/feedback";
import { cn } from "@/lib/utils/format";

export type ProviderOption = {
  id: "stripe" | "paystack";
  label: string;
  currencyLabel: string;
  prices: { interval: "month" | "year"; display: string | null }[];
};

async function post(url: string, body?: unknown): Promise<{ url?: string; error?: string }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return (await res.json().catch(() => ({ error: "Something went wrong." }))) as { url?: string; error?: string };
}

export function UpgradeOptions({ providers, preferred }: { providers: ProviderOption[]; preferred: "stripe" | "paystack" }) {
  const ordered = [...providers].sort((a, b) => (a.id === preferred ? -1 : b.id === preferred ? 1 : 0));
  const [provider, setProvider] = useState(ordered[0]?.id);
  const [interval, setInterval] = useState<"month" | "year">(ordered[0]?.prices[0]?.interval ?? "month");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const current = ordered.find((p) => p.id === provider);
  return (
    <div className="space-y-3">
      {ordered.length > 1 && (
        <div role="radiogroup" aria-label="Payment provider" className="grid gap-2 sm:grid-cols-2">
          {ordered.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={provider === p.id}
              onClick={() => {
                setProvider(p.id);
                setInterval(p.prices[0]?.interval ?? "month");
              }}
              className={cn("focus-ring rounded-2xl border p-3 text-left text-sm", provider === p.id ? "border-accent bg-accent/10" : "border-line hover:border-line-strong")}
            >
              <span className="block font-semibold">{p.label}</span>
              <span className="text-xs text-fg-2">{p.currencyLabel}</span>
            </button>
          ))}
        </div>
      )}
      {current && current.prices.length > 1 && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Billing period">
          {current.prices.map((pr) => (
            <button key={pr.interval} type="button" role="radio" aria-checked={interval === pr.interval} onClick={() => setInterval(pr.interval)} className={cn("focus-ring rounded-full border px-3 py-2 text-sm", interval === pr.interval ? "border-accent bg-accent/10" : "border-line")}>
              {pr.interval === "month" ? "Monthly" : "Yearly"}
              {pr.display ? ` · ${pr.display}` : ""}
            </button>
          ))}
        </div>
      )}
      {error && <FormMessage>{error}</FormMessage>}
      <Button
        className="w-full"
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(undefined);
            const r = await post("/api/billing/checkout", { provider, interval });
            if (r.url) window.location.assign(r.url);
            else setError(r.error ?? "Something went wrong.");
          })
        }
      >
        <CreditCard className="size-4" aria-hidden="true" /> Upgrade with {current?.label}
      </Button>
      <p className="text-xs text-muted">You&apos;ll pay on {current?.label}&apos;s secure page. Premium starts as soon as the payment is confirmed. Cancel any time.</p>
    </div>
  );
}

export function ManageSubscription() {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(undefined);
            const r = await post("/api/billing/portal");
            if (r.url) window.location.assign(r.url);
            else setError(r.error ?? "Something went wrong.");
          })
        }
      >
        <ExternalLink className="size-4" aria-hidden="true" /> Manage or cancel subscription
      </Button>
      {error && <FormMessage>{error}</FormMessage>}
    </div>
  );
}
