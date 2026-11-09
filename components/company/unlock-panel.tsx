"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { COMPANY_BILLING, type CompanyCheckoutAccess } from "@/lib/company-billing";

type Props = {
  open: boolean;
  matchCount: number;
  searchId: string | null;
  customerEmail?: string | null;
  stripeConfigured: boolean;
  onClose: () => void;
  /** Demo path when Stripe price ids are not configured. */
  onDemoUnlock: (access: CompanyCheckoutAccess) => void;
};

export function UnlockPanel({
  open,
  matchCount,
  searchId,
  customerEmail,
  stripeConfigured,
  onClose,
  onDemoUnlock,
}: Props) {
  const [busy, setBusy] = useState<CompanyCheckoutAccess | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function startCheckout(access: CompanyCheckoutAccess) {
    setError(null);
    setBusy(access);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access,
          plan: access === "monthly" ? COMPANY_BILLING.monthly.planKey : undefined,
          searchId,
          customerEmail: customerEmail || undefined,
          matchCount,
        }),
      });
      const data = (await response.json()) as { url?: string; error?: string; demo?: boolean };
      if (response.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      if (response.status === 503 || data.demo) {
        onDemoUnlock(access);
        return;
      }
      setError(data.error || "Checkout is unavailable right now.");
    } catch {
      setError("Checkout failed. Try again or use demo unlock below.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-heading/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unlock-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Unlock</p>
            <h2 id="unlock-title" className="mt-1 font-display text-2xl font-semibold text-heading">
              {matchCount} match{matchCount === 1 ? "" : "es"} ready
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              One-time unlocks <strong className="font-medium text-heading">this search only</strong> —
              not a credit pack. Monthly keeps Search &amp; Match open while subscribed.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void startCheckout("one_time_search")}
            className="rounded-xl border border-border/70 bg-surface-inset/80 p-4 text-left transition hover:border-primary/40 disabled:opacity-60"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-display text-lg font-semibold text-heading">
                {COMPANY_BILLING.oneTime.label}
              </p>
              <p className="text-sm font-medium text-heading">{COMPANY_BILLING.oneTime.displayPrice}</p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{COMPANY_BILLING.oneTime.summary}</p>
            <p className="mt-2 text-xs text-muted-foreground">{COMPANY_BILLING.oneTime.detail}</p>
            <p className="mt-3 text-xs font-medium text-primary">
              {busy === "one_time_search" ? "Starting checkout…" : "Pay once for this result set"}
            </p>
          </button>

          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void startCheckout("monthly")}
            className="rounded-xl border border-border/70 bg-surface-inset/80 p-4 text-left transition hover:border-primary/40 disabled:opacity-60"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-display text-lg font-semibold text-heading">
                {COMPANY_BILLING.monthly.label}
              </p>
              <p className="text-sm font-medium text-heading">{COMPANY_BILLING.monthly.displayPrice}</p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{COMPANY_BILLING.monthly.summary}</p>
            <p className="mt-2 text-xs text-muted-foreground">{COMPANY_BILLING.monthly.detail}</p>
            <p className="mt-3 text-xs font-medium text-primary">
              {busy === "monthly" ? "Starting checkout…" : "Subscribe for ongoing unlocks"}
            </p>
          </button>
        </div>

        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

        {!stripeConfigured ? (
          <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-3 text-sm text-amber-950 dark:text-amber-100">
            <p>
              {/* TODO(billing): set STRIPE_PRICE_SEARCH_ONCE + monthly price ids in env for live checkout. */}
              Stripe prices are not configured in this environment. Use demo unlock to walk the UI.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button type="button" size="sm" onClick={() => onDemoUnlock("one_time_search")}>
                Demo: unlock this search
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onDemoUnlock("monthly")}
              >
                Demo: monthly access
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
