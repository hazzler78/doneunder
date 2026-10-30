import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { parseBillingStatus } from "@/lib/billing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BillingPanel } from "./billing-panel";
import { CompanySearch } from "./search-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search & Match | doneunder.ai",
  robots: { index: false, follow: false },
};

export default async function CompanySearchPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const { billing } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/company/search")}`);

  const { data: actor } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
  if (actor?.role !== "company") redirect("/workspace");

  const { data: billingData } = await supabase.rpc("company_billing_status");
  const billingStatus = parseBillingStatus(billingData);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Search &amp; Match</h1>
        <p className="text-sm text-muted-foreground">
          Describe the job. We show up to 10 anonymous matching divers with valid tickets; reveal one per search.
        </p>
      </header>
      <BillingPanel
        status={billingStatus}
        justPaid={billing === "success"}
        portalError={billing === "portal_error"}
      />
      <CompanySearch />
    </main>
  );
}
