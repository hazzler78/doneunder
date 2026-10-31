/**
 * Send mail as hello@doneunder.ai via Resend only.
 * Refuses to send if RESEND_FROM_EMAIL is not hello@doneunder.ai.
 *
 * Usage:
 *   node --env-file=.env.local scripts/send-hello-email.mjs \
 *     --to someone@example.com \
 *     --subject "Subject" \
 *     --body "Plain text body"
 *
 * Or: --body-file path/to/body.txt
 * Dry-run (no send): add --dry-run
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { Resend } = require("resend");

const CONTACT = "hello@doneunder.ai";

function usage() {
  console.log(`Usage:
  node --env-file=.env.local scripts/send-hello-email.mjs --to <email> --subject <text> (--body <text> | --body-file <path>) [--dry-run]`);
}

function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--to") out.to = argv[++i];
    else if (a === "--subject") out.subject = argv[++i];
    else if (a === "--body") out.body = argv[++i];
    else if (a === "--body-file") out.bodyFile = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

function parseFromAddress(header) {
  const match = String(header || "").match(/<([^>]+)>/);
  return (match?.[1] ?? header).trim().toLowerCase();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const to = String(args.to || "")
    .trim()
    .toLowerCase();
  const subject = String(args.subject || "").trim();
  let body = String(args.body || "");
  if (args.bodyFile) {
    body = readFileSync(args.bodyFile, "utf8");
  }
  body = body.trim();

  if (!to.includes("@") || !subject || !body) {
    usage();
    process.exit(1);
  }

  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const from = (process.env.RESEND_FROM_EMAIL || "").trim();
  if (!apiKey) {
    console.error("Missing RESEND_API_KEY.");
    process.exit(1);
  }
  if (parseFromAddress(from) !== CONTACT) {
    console.error(
      `Refused: RESEND_FROM_EMAIL must be ${CONTACT} (got ${from || "(empty)"}). No personal Gmail fallback.`,
    );
    process.exit(2);
  }

  if (args.dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, from, to, subject }, null, 2));
    return;
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    replyTo: CONTACT,
    subject,
    text: body,
  });

  if (error) {
    console.error("SEND_FAILED", error);
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, id: data?.id ?? null, from, to }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
