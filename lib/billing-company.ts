import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BillingCompany = {
  userId: string;
  email: string | null;
  companyName: string;
  stripeCustomerId: string | null;
  subscriptionStatus: string;
};

export type BillingCompanyResult =
  | { ok: true; company: BillingCompany }
  | { ok: false; reason: "not_authenticated" | "not_company" | "no_company_row" };

/** The signed-in company (session-based), read with the service role so RLS cannot hide fields. */
export async function getSignedInBillingCompany(): Promise<BillingCompanyResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "not_authenticated" };

  const admin = createServiceSupabaseClient();
  const { data: actor } = await admin.from("users").select("id,role,email").eq("id", user.id).maybeSingle();
  if (!actor || actor.role !== "company") return { ok: false, reason: "not_company" };

  const { data: company } = await admin
    .from("companies")
    .select("user_id,company_name,stripe_customer_id,subscription_status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!company) return { ok: false, reason: "no_company_row" };

  return {
    ok: true,
    company: {
      userId: company.user_id as string,
      email: (actor.email as string | null) ?? user.email ?? null,
      companyName: (company.company_name as string) || "Company",
      stripeCustomerId: (company.stripe_customer_id as string | null) ?? null,
      subscriptionStatus: ((company.subscription_status as string | null) ?? "inactive").trim().toLowerCase(),
    },
  };
}
