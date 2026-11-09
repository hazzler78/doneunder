import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { CompanyCheckoutAccess } from "@/lib/company-billing";
import { isStripeConfigured } from "@/lib/feature-flags";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CompanySearch } from "./search-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search candidates | doneunder.ai",
  robots: { index: false, follow: false },
};

function parseBillingAccess(raw: string | undefined): CompanyCheckoutAccess | null {
  if (raw === "one_time_search" || raw === "monthly") return raw;
  return null;
}

export default async function CompanySearchPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string; access?: string }>;
}) {
  const { billing, access: accessRaw } = await searchParams;
  const billingSuccess = billing === "success" ? parseBillingAccess(accessRaw) : null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/company/search")}`);

  const { data: actor } = await supabase.from("users").select("role, email").eq("id", user.id).maybeSingle();
  if (actor?.role !== "company") {
    return (
      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-12">
        <h1 className="font-display text-3xl font-semibold text-heading">Company search</h1>
        <p className="text-sm text-muted-foreground">
          This area is for company accounts. Create a company login to search locked candidate
          previews and unlock full profiles.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/company/register">
            <Button>Register as a company</Button>
          </Link>
          <Link href="/workspace">
            <Button variant="outline">Back to workspace</Button>
          </Link>
        </div>
      </main>
    );
  }

  const { data: company } = await supabase
    .from("companies")
    .select("company_name, subscription_status")
    .eq("user_id", user.id)
    .maybeSingle();

  const subscriptionActive =
    (company?.subscription_status ?? "").trim().toLowerCase() === "active" ||
    billingSuccess === "monthly";

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Search &amp; Match</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-heading">
          Find verified commercial divers
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          See how many candidates match before you pay. Cards show initials and industry only until
          you unlock this search (one-time) or keep monthly access.
        </p>
      </header>
      <CompanySearch
        subscriptionActive={subscriptionActive}
        customerEmail={actor.email ?? user.email ?? null}
        companyName={company?.company_name ?? null}
        stripeConfigured={isStripeConfigured()}
        billingSuccess={billingSuccess}
      />
    </main>
  );
}
