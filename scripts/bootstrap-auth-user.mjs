import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function usage() {
  console.log(`Usage:
  node --env-file=.env.local scripts/bootstrap-auth-user.mjs <email> <password> <fullName> [username] [role]

Examples:
  node --env-file=.env.local scripts/bootstrap-auth-user.mjs hello@doneunder.ai "YourPass123" "Hello Admin" hello admin
  node --env-file=.env.local scripts/bootstrap-auth-user.mjs gareth@doneunder.ai admin1234 "Gareth Darrin Middleton" gareth diver`);
}

async function run() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  const password = process.argv[3] || "";
  const fullName = (process.argv[4] || "").trim();
  const username = (process.argv[5] || "").trim().toLowerCase() || null;
  const role = (process.argv[6] || "diver").trim().toLowerCase();

  if (!email || !password || !fullName) {
    usage();
    process.exit(1);
  }

  if (!["diver", "company", "admin"].includes(role)) {
    throw new Error(`Invalid role "${role}". Use diver, company, or admin.`);
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const existing = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (existing.error) throw new Error(existing.error.message);

  const found = existing.data.users.find((user) => user.email?.toLowerCase() === email);
  let userId = found?.id;

  if (!found) {
    const created = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, ...(username ? { username } : {}) },
    });
    if (created.error) throw new Error(created.error.message);
    userId = created.data.user.id;
    console.log(`Created auth user: ${email}`);
  } else {
    const updated = await supabase.auth.admin.updateUserById(found.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...(found.user_metadata ?? {}),
        full_name: fullName,
        ...(username ? { username } : {}),
      },
    });
    if (updated.error) throw new Error(updated.error.message);
    console.log(`Updated auth user password: ${email}`);
  }

  const { error: userRowError } = await supabase.from("users").upsert(
    {
      id: userId,
      role,
      email,
      username,
      full_name: fullName,
    },
    { onConflict: "id" },
  );

  if (userRowError) throw new Error(userRowError.message);

  console.log(`Synced public.users row (role=${role}${username ? `, username=${username}` : ""}).`);
  console.log("You can now sign in at /login with this email and password.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
