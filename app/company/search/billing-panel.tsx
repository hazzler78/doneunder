import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FAIR_USE, type CompanyBillingStatus } from "@/lib/billing";

function fmt(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Plan status on the Search & Match page: Unlimited, open one-time searches, or buy prompt. */
export function BillingPanel({
  status,
  justPaid,
  portalError,
}: {
  status: CompanyBillingStatus | null;
  justPaid: boolean;
  portalError: boolean;
}) {
  const portal = status?.has_stripe_customer ? (
    <form action="/api/stripe/portal" method="post">
      <Button type="submit" size="sm" variant="outline">
        Manage billing
      </Button>
    </form>
  ) : null;

  let body: React.ReactNode;
  if (status?.subscription_active) {
    const renews = fmt(status.current_period_end);
    body = (
      <p>
        <strong>Unlimited</strong> is active
        {renews ? (status.cancel_at_period_end ? ` until ${renews} (cancelled)` : ` · renews ${renews}`) : ""}. Fair
        use: {FAIR_USE.perHour} searches per hour, {FAIR_USE.perDay} per day.
      </p>
    );
  } else if (status && status.open_one_time_searches > 0) {
    body = (
      <p>
        You have <strong>{status.open_one_time_searches}</strong> one-time search
        {status.open_one_time_searches === 1 ? "" : "es"} available
        {status.next_one_time_expiry ? ` (use by ${fmt(status.next_one_time_expiry)})` : ""}. A search is only used
        when it returns matches.
      </p>
    );
  } else {
    body = (
      <p>
        {status?.subscription_status === "past_due"
          ? "Your Unlimited payment failed. Update your card in Manage billing to restore access."
          : "No active plan. Buy a one-time search (USD 190) or Unlimited (USD 250/month) to search."}{" "}
        <Link href="/pricing" className="text-primary underline">
          See pricing
        </Link>
      </p>
    );
  }

  return (
    <section className="space-y-2 rounded-2xl border border-border/60 p-4 text-sm">
      {justPaid ? (
        <p className="font-medium text-primary">
          Payment received. Access is usually active within a few seconds; refresh if it does not show yet.
        </p>
      ) : null}
      {portalError ? <p className="text-destructive">Could not open billing. Try again in a moment.</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>{body}</div>
        {portal}
      </div>
    </section>
  );
}
