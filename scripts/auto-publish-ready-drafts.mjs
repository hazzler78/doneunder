/**
 * One-shot: publish existing draft divers who already have a processed CV
 * and have never been published (published_at is null).
 *
 * Usage:
 *   node --env-file=.env.local scripts/auto-publish-ready-drafts.mjs
 *   node --env-file=.env.local scripts/auto-publish-ready-drafts.mjs --dry-run
 */
import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function headlineOf(row) {
  return String(row.headline || "").trim() || String(row.ambassador_public_headline || "").trim();
}

function hasReadyContent(row) {
  return (
    Boolean(row.cv_last_processed_at) ||
    headlineOf(row).length > 0 ||
    Boolean(String(row.polished_cv_markdown || "").trim())
  );
}

async function run() {
  const dryRun = process.argv.includes("--dry-run");
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profiles, error } = await supabase
    .from("diver_profiles")
    .select(
      "user_id, profile_status, published_at, cv_last_processed_at, headline, bio, ambassador_public_headline, ambassador_short_bio, polished_cv_markdown",
    )
    .eq("profile_status", "draft")
    .is("published_at", null)
    .limit(500);

  if (error) throw new Error(error.message);

  const rows = (profiles ?? []).filter(hasReadyContent);
  if (rows.length === 0) {
    console.log("No eligible draft profiles.");
    return;
  }

  const ids = rows.map((row) => row.user_id);
  const { data: divers, error: diversError } = await supabase
    .from("users")
    .select("id, username, email, role, full_name")
    .in("id", ids)
    .eq("role", "diver");

  if (diversError) throw new Error(diversError.message);

  const diverById = Object.fromEntries((divers ?? []).map((d) => [d.id, d]));

  const { data: references, error: refsError } = await supabase
    .from("diver_references")
    .select("diver_id, name, phone")
    .in("diver_id", ids);

  if (refsError) throw new Error(refsError.message);

  const refsByUser = {};
  for (const ref of references ?? []) {
    const list = refsByUser[ref.diver_id] ?? [];
    list.push(ref);
    refsByUser[ref.diver_id] = list;
  }

  let published = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const diver = diverById[row.user_id];
    if (!diver) {
      skipped += 1;
      console.log(`skip ${row.user_id} — not a diver role`);
      continue;
    }

    const headline = headlineOf(row);
    const errors = [];
    if (!headline) {
      errors.push("Headline is required.");
    }
    for (const [index, ref] of (refsByUser[row.user_id] ?? []).entries()) {
      if (!String(ref.phone || "").trim()) {
        errors.push(`Reference #${index + 1} (${ref.name}) requires a phone number.`);
      }
    }

    const label = diver.username || diver.email || row.user_id;
    if (errors.length) {
      failed += 1;
      console.log(`fail @${label} — ${errors.join(" ")}`);
      continue;
    }

    if (dryRun) {
      published += 1;
      console.log(`dry-run publish @${label}`);
      continue;
    }

    const nowIso = new Date().toISOString();
    const syncScalars = {};
    if (!String(row.headline || "").trim() && headline) syncScalars.headline = headline;
    const bio = String(row.bio || "").trim() || String(row.ambassador_short_bio || "").trim();
    if (!String(row.bio || "").trim() && bio) syncScalars.bio = bio;

    const { error: updateError } = await supabase
      .from("diver_profiles")
      .update({
        profile_status: "published",
        published_at: nowIso,
        updated_at: nowIso,
        ...syncScalars,
      })
      .eq("user_id", row.user_id);

    if (updateError) {
      failed += 1;
      console.log(`fail @${label} — ${updateError.message}`);
      continue;
    }

    published += 1;
    console.log(`published @${label}`);
  }

  console.log(
    `\nDone${dryRun ? " (dry-run)" : ""}. published=${published} failed=${failed} skipped=${skipped} candidates=${rows.length}`,
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
