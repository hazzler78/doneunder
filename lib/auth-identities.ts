import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export type PasswordResetEligibility =
  | { status: "eligible" }
  | { status: "google_only" }
  | { status: "unknown" };

function createServiceAdmin(): SupabaseClient | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !serviceUrl) return null;
  return createClient(serviceUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function providersFromUser(user: User): Set<string> {
  const fromIdentities = (user.identities ?? []).map((identity) => identity.provider);
  const appProvider =
    typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : null;
  const providers = new Set(fromIdentities);
  if (appProvider) providers.add(appProvider);
  return providers;
}

/** True when the account can receive a password-reset email (email identity or password login). */
export function userCanReceivePasswordResetEmail(user: User): boolean {
  const providers = providersFromUser(user);
  if (providers.has("email")) return true;
  if (providers.has("google") && providers.size === 1) return false;
  // OAuth-only without email identity — no password to reset.
  if (providers.size > 0 && !providers.has("email")) return false;
  return true;
}

export function eligibilityFromAuthUser(user: User | null | undefined): PasswordResetEligibility {
  if (!user) return { status: "unknown" };
  if (!userCanReceivePasswordResetEmail(user)) return { status: "google_only" };
  return { status: "eligible" };
}

/** Resolve auth.users row by email using service role (server-only). */
export async function findAuthUserByEmail(email: string): Promise<User | null> {
  const admin = createServiceAdmin();
  if (!admin) return null;

  const normalized = email.trim().toLowerCase();
  const { data: row } = await admin.from("users").select("id").eq("email", normalized).maybeSingle();
  if (row?.id) {
    const { data } = await admin.auth.admin.getUserById(row.id);
    if (data.user) return data.user;
  }

  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    console.error("findAuthUserByEmail listUsers failed:", error.message);
    return null;
  }
  return data.users.find((user) => user.email?.trim().toLowerCase() === normalized) ?? null;
}

export async function passwordResetEligibilityForEmail(email: string): Promise<PasswordResetEligibility> {
  const user = await findAuthUserByEmail(email);
  return eligibilityFromAuthUser(user);
}

export function userHasGoogleIdentity(user: User): boolean {
  return providersFromUser(user).has("google");
}

export function userHasEmailPasswordIdentity(user: User): boolean {
  return providersFromUser(user).has("email");
}
