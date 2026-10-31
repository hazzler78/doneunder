"use server";

import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { passwordResetEligibilityForEmail } from "@/lib/auth-identities";
import { safeInternalPath } from "@/lib/auth-paths";
import { parseBillingProduct } from "@/lib/billing";
import {
  companyRegisterPath,
  normalizeCompanyName,
  normalizeContactName,
} from "@/lib/company-register";
import { SITE_URL } from "@/lib/site";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AnalyticsEvent } from "@/lib/analytics-events";
import { createCompanyCheckoutUrl } from "@/lib/stripe-checkout";
import { trackAnalyticsEventServer } from "@/lib/track-analytics-server";
import { claimPreferredUsername, isValidPublicUsername, normalizeUsername } from "@/lib/usernames";
import { isStripeConfigured } from "@/lib/feature-flags";

function withMessage(path: string, message: string) {
  const query = new URLSearchParams({ message }).toString();
  return `${path}?${query}`;
}

async function requestOrigin() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host}`;
  return SITE_URL;
}

async function resolveEmailForLogin(identifierRaw: string) {
  const identifier = identifierRaw.trim();
  if (!identifier) return null;

  if (identifier.includes("@")) {
    return identifier.toLowerCase();
  }

  const normalizedUser = identifier.toLowerCase();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !serviceUrl) {
    return null;
  }

  const admin = createClient(serviceUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data } = await admin.from("users").select("email").eq("username", normalizedUser).maybeSingle();
  const email = data?.email?.trim().toLowerCase();
  return email || null;
}

export async function loginAction(formData: FormData) {
  const identifier = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!identifier || !password) {
    redirect(withMessage("/login", "Email and password are required."));
  }

  const email = await resolveEmailForLogin(identifier);
  if (!email) {
    redirect(
      withMessage(
        "/login",
        identifier.includes("@")
          ? "Invalid login credentials."
          : `No account found for username "${identifier}". Sign in with your email or check spelling.`,
      ),
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const message =
      error.message === "Invalid login credentials"
        ? `Invalid login credentials for ${email}. If this is a new address, create an account at /register or ask an admin to bootstrap the user in Supabase Auth.`
        : error.message;
    redirect(withMessage("/login", message));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    redirect(withMessage("/login", "Signed in, but user session was not established."));
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (serviceKey && serviceUrl) {
    const admin = createClient(serviceUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: existing } = await admin
      .from("users")
      .select("username, email, role")
      .eq("id", user.id)
      .maybeSingle();
    if ((existing?.role ?? "diver") === "diver") {
      await claimPreferredUsername(admin, {
        userId: user.id,
        email: existing?.email ?? user.email,
        currentUsername: existing?.username,
        metadataUsername: typeof user.user_metadata?.username === "string" ? user.user_metadata.username : null,
      });
    }
  }

  const { data: userRow } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
  const role = userRow?.role ?? "diver";
  const next = safeInternalPath(String(formData.get("next") ?? "/workspace"));

  if (role === "admin") {
    redirect("/dashboard/admin");
  }
  redirect(next);
}

export async function registerAction(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const usernameRaw = String(formData.get("username") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const username = normalizeUsername(usernameRaw);

  if (!fullName || !usernameRaw.trim() || !email || !password) {
    redirect(withMessage("/register", "Full name, username, email, and password are required."));
  }

  if (!username || !isValidPublicUsername(username)) {
    redirect(
      withMessage(
        "/register",
        "Username must be 3–30 characters: letters, numbers, _ or - only. Do not use an email address.",
      ),
    );
  }

  if (password.length < 8) {
    redirect(withMessage("/register", "Password must be at least 8 characters."));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, username },
    },
  });

  if (error) {
    redirect(withMessage("/register", error.message));
  }

  if (!data.user?.id) {
    redirect(withMessage("/register", "Registration failed. Please try again."));
  }

  const userRow = {
    id: data.user.id,
    role: "diver" as const,
    email,
    username,
    full_name: fullName,
  };

  // Bootstrap `users` with service role: anon session has no INSERT on `users` RLS,
  // and email-confirm flow may leave no session yet (auth.uid() null).
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const upsertClient =
    serviceKey && serviceUrl
      ? createClient(serviceUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : supabase;

  const { error: userInsertError } = await upsertClient.from("users").upsert(userRow, { onConflict: "id" });

  if (userInsertError) {
    redirect(withMessage("/register", userInsertError.message));
  }

  await trackAnalyticsEventServer(AnalyticsEvent.DiverSignup, { signup_method: "email" });

  redirect(safeInternalPath(String(formData.get("next") ?? "/workspace")));
}

/**
 * Company self-registration: create auth user + users.role=company + inactive companies row,
 * sign in, then continue into Stripe Checkout for the chosen plan (one_time | monthly).
 * Does not change diver /register.
 */
export async function registerCompanyAction(formData: FormData) {
  const companyName = normalizeCompanyName(String(formData.get("companyName") ?? ""));
  const contactName = normalizeContactName(String(formData.get("contactName") ?? ""));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const product = parseBillingProduct(formData.get("product"));
  const registerPath = companyRegisterPath(product);

  const fail = (message: string) => redirect(withMessage(registerPath, message));

  if (!companyName || !contactName || !email || !password) {
    return fail("Company name, contact name, work email, and password are required.");
  }
  if (!email.includes("@")) {
    return fail("Enter a valid work email.");
  }
  if (password.length < 8) {
    return fail("Password must be at least 8 characters.");
  }
  if (!product) {
    return fail("Choose a plan on the pricing page, then create your company account.");
  }
  if (!isStripeConfigured()) {
    return fail("Online payment is not available yet. Email hello@doneunder.ai for access.");
  }

  let admin;
  try {
    admin = createServiceSupabaseClient();
  } catch {
    return fail("Registration is temporarily unavailable. Please try again later.");
  }

  const { data: existingUser } = await admin.from("users").select("id, role").eq("email", email).maybeSingle();
  if (existingUser) {
    if (existingUser.role === "company") {
      return fail("That email already has a company account. Sign in, then buy from Pricing.");
    }
    return fail("That email is already registered. Use a work email, or sign in if you already have access.");
  }

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: contactName,
      company_name: companyName,
      account_type: "company",
    },
  });
  if (created.error || !created.data.user?.id) {
    const msg = created.error?.message ?? "Registration failed. Please try again.";
    if (/already|registered|exists/i.test(msg)) {
      return fail("That email is already registered. Sign in, or use another work email.");
    }
    return fail(msg);
  }

  const userId = created.data.user.id;

  const { error: userInsertError } = await admin.from("users").upsert(
    {
      id: userId,
      role: "company",
      email,
      username: null,
      full_name: contactName,
    },
    { onConflict: "id" },
  );
  if (userInsertError) {
    return fail(userInsertError.message);
  }

  const { error: companyInsertError } = await admin.from("companies").upsert(
    {
      user_id: userId,
      company_name: companyName,
      subscription_status: "inactive",
      plan: product === "monthly" ? "unlimited_250" : "one_time_190",
    },
    { onConflict: "user_id" },
  );
  if (companyInsertError) {
    return fail(companyInsertError.message);
  }

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    return fail(`Account created, but sign-in failed: ${signInError.message}. Sign in and open Pricing.`);
  }

  try {
    const origin = await requestOrigin();
    const checkoutUrl = await createCompanyCheckoutUrl(
      {
        userId,
        email,
        companyName,
        stripeCustomerId: null,
        subscriptionStatus: "inactive",
      },
      product,
      { baseUrl: origin },
    );
    redirect(checkoutUrl);
  } catch (error) {
    console.error("[registerCompany] checkout failed", error);
    redirect(`/pricing?billing=error&reason=checkout_failed`);
  }
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

/** Send a password-reset link to the account email (or username → email). */
export async function forgotPasswordAction(formData: FormData) {
  const identifier = String(formData.get("email") ?? "").trim();
  if (!identifier) {
    redirect(withMessage("/forgot-password", "Enter the email or username for your account."));
  }

  const email = await resolveEmailForLogin(identifier);
  // Generic success — do not reveal whether the account exists.
  const successPath = withMessage(
    "/forgot-password",
    "If an account exists for that address, we sent a reset link. Check your inbox (and spam).",
  );

  if (!email) {
    redirect(successPath);
  }

  const eligibility = await passwordResetEligibilityForEmail(email);
  if (eligibility.status === "google_only") {
    redirect(
      withMessage(
        "/forgot-password",
        "This account uses Google sign-in. On the sign-in page, choose Continue with Google instead of resetting a password.",
      ),
    );
  }

  const origin = await requestOrigin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/recovery`,
  });

  if (error) {
    redirect(withMessage("/forgot-password", error.message));
  }

  redirect(successPath);
}

/** Set a new password after the recovery link established a session. */
export async function updatePasswordAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    redirect(withMessage("/reset-password", "Password must be at least 8 characters."));
  }
  if (password !== confirm) {
    redirect(withMessage("/reset-password", "Passwords do not match."));
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      withMessage(
        "/forgot-password",
        "Your reset link expired or was already used. Request a new one.",
      ),
    );
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(withMessage("/reset-password", error.message));
  }

  await supabase.auth.signOut();
  redirect(withMessage("/login", "Password updated. Sign in with your new password."));
}
