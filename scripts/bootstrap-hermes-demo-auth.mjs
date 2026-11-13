import { createClient } from "@supabase/supabase-js";

const HERMES_DEMO_USER_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const HERMES_DEMO_EMAIL = "hermes@demo.doneunder.ai";
const HERMES_DEMO_USERNAME = "hermes-demo";
const HERMES_DEMO_BOOTSTRAP_PASSWORD = "HermesDemo2026!";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function run() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const existing = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (existing.error) throw new Error(existing.error.message);

  const found = existing.data.users.find((user) => user.email?.toLowerCase() === HERMES_DEMO_EMAIL);
  let userId = found?.id ?? HERMES_DEMO_USER_ID;

  if (!found) {
    const created = await supabase.auth.admin.createUser({
      id: HERMES_DEMO_USER_ID,
      email: HERMES_DEMO_EMAIL,
      password: HERMES_DEMO_BOOTSTRAP_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Hermes Test Diver", username: HERMES_DEMO_USERNAME },
    });
    if (created.error) throw new Error(created.error.message);
    userId = created.data.user.id;
    console.log(`Created auth user: ${HERMES_DEMO_EMAIL}`);
  } else {
    const updated = await supabase.auth.admin.updateUserById(found.id, {
      password: HERMES_DEMO_BOOTSTRAP_PASSWORD,
      email_confirm: true,
      user_metadata: {
        ...(found.user_metadata ?? {}),
        full_name: "Hermes Test Diver",
        username: HERMES_DEMO_USERNAME,
      },
    });
    if (updated.error) throw new Error(updated.error.message);
    userId = found.id;
    console.log(`Updated auth user password: ${HERMES_DEMO_EMAIL}`);
  }

  const { error: userRowError } = await supabase.from("users").upsert(
    {
      id: userId,
      role: "diver",
      email: HERMES_DEMO_EMAIL,
      username: HERMES_DEMO_USERNAME,
      full_name: "Hermes Test Diver",
    },
    { onConflict: "id" },
  );
  if (userRowError) throw new Error(userRowError.message);

  console.log("Hermes demo ready. Sign in at /login with:");
  console.log(`  email: ${HERMES_DEMO_EMAIL}`);
  console.log(`  password: ${HERMES_DEMO_BOOTSTRAP_PASSWORD}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
