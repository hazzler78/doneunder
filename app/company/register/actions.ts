"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { AnalyticsEvent } from "@/lib/analytics-events";
import { safeInternalPath } from "@/lib/auth-paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { trackAnalyticsEventServer } from "@/lib/track-analytics-server";

function withMessage(path: string, message: string) {
  const query = new URLSearchParams({ message }).toString();
  return `${path}?${query}`;
}

/** Creates a company user + inactive `companies` row, then sends them to Search & Match. */
export async function registerCompanyAction(formData: FormData) {
  const companyName = String(formData.get("companyName") ?? "").trim();
  const contactName = String(formData.get("contactName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const variant = String(formData.get("variant") ?? "a").trim().toLowerCase() === "b" ? "b" : "a";
  const next = safeInternalPath(String(formData.get("next") ?? "/company/search"), "/company/search");

  if (!companyName || !contactName || !email || !password) {
    redirect(withMessage("/company/register", "Company name, contact name, email, and password are required."));
  }
  if (password.length < 8) {
    redirect(withMessage("/company/register", "Password must be at least 8 characters."));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: contactName,
        company_name: companyName,
        account_type: "company",
      },
    },
  });

  if (error) {
    redirect(withMessage(`/company/register?v=${variant}`, error.message));
  }
  if (!data.user?.id) {
    redirect(withMessage(`/company/register?v=${variant}`, "Registration failed. Please try again."));
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const admin =
    serviceKey && serviceUrl
      ? createClient(serviceUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : supabase;

  const { error: userInsertError } = await admin.from("users").upsert(
    {
      id: data.user.id,
      role: "company",
      email,
      username: null,
      full_name: contactName,
    },
    { onConflict: "id" },
  );
  if (userInsertError) {
    redirect(withMessage(`/company/register?v=${variant}`, userInsertError.message));
  }

  const { error: companyInsertError } = await admin.from("companies").upsert(
    {
      user_id: data.user.id,
      company_name: companyName,
      subscription_status: "inactive",
      plan: "199",
    },
    { onConflict: "user_id" },
  );
  if (companyInsertError) {
    redirect(withMessage(`/company/register?v=${variant}`, companyInsertError.message));
  }

  await trackAnalyticsEventServer(AnalyticsEvent.CompanySignup, {
    signup_method: "email",
    landing_variant: variant,
  });

  redirect(next.includes("/company/") ? next : "/company/search");
}
