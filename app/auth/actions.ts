"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { claimPreferredUsername } from "@/lib/usernames";

function withMessage(path: string, message: string) {
  const query = new URLSearchParams({ message }).toString();
  return `${path}?${query}`;
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

  if (role === "admin") {
    redirect("/dashboard/admin");
  }
  redirect("/workspace");
}

export async function registerAction(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!fullName || !username || !email || !password) {
    redirect(withMessage("/register", "Full name, username, email, and password are required."));
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

  redirect("/workspace");
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
