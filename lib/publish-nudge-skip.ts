/** Accounts we never nudge to publish (testers / non-divers). */
const SKIP_USERNAMES = new Set(["mikael"]);

/** Addresses that asked to stop publish reminders. */
const SKIP_EMAILS = new Set(["jsh.even@gmail.com"]);

export function isPublishNudgeSkipped(input: { email?: string | null; username?: string | null }) {
  const username = input.username?.trim().toLowerCase() || "";
  if (username && SKIP_USERNAMES.has(username)) return true;
  const email = input.email?.trim().toLowerCase() || "";
  return email.length > 0 && SKIP_EMAILS.has(email);
}
