"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    redirect(withMessage("/login", "Invalid login credentials."));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(withMessage("/login", error.message));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    redirect(withMessage("/login", "Signed in, but user session was not established."));
  }

  const { data: userRow } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
  const role = userRow?.role ?? "diver";

  if (role === "admin") {
    redirect("/dashboard/admin");
  }
  if (role === "company") {
    redirect("/dashboard/company");
  }
  redirect("/dashboard/diver");
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

  redirect("/dashboard/diver");
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
