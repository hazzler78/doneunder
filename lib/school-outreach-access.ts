import { stripQuotes } from "@/lib/email";

/** Usernames allowed to use school outreach tools in Hermes (comma-separated env override). */
const DEFAULT_OUTREACH_USERNAMES = new Set(["gareth"]);

function outreachUsernames(): Set<string> {
  const raw = stripQuotes(process.env.SCHOOL_OUTREACH_USERNAMES || "");
  if (!raw.trim()) return DEFAULT_OUTREACH_USERNAMES;
  return new Set(
    raw
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function canUseSchoolOutreach(username: string | null | undefined, email?: string | null) {
  const u = username?.trim().toLowerCase();
  if (u && outreachUsernames().has(u)) return true;
  const e = email?.trim().toLowerCase() || "";
  if (e === "gareth@doneunder.ai") return true;
  return false;
}
