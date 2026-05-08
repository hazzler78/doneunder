import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function run() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const email = "gareth@doneunder.ai";
  const password = "admin1234";

  const supabase = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const existing = await supabase.auth.admin.listUsers();
  const found = existing.data.users.find((user) => user.email?.toLowerCase() === email);

  if (!found) {
    const created = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Gareth Darrin Middleton", username: "gareth" },
    });
    if (created.error) throw new Error(created.error.message);
    console.log("Created auth user for gareth@doneunder.ai");
  } else {
    const updated = await supabase.auth.admin.updateUserById(found.id, {
      password,
      email_confirm: true,
      user_metadata: { ...(found.user_metadata ?? {}), full_name: "Gareth Darrin Middleton", username: "gareth" },
    });
    if (updated.error) throw new Error(updated.error.message);
    console.log("Updated existing auth user password for gareth@doneunder.ai");
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
