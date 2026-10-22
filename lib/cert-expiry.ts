export const CERT_EXPIRY_TIMEZONE = "Europe/Berlin";
export const DEFAULT_LEAD_DAYS = 30;
export const SOON_BADGE_CAP_DAYS = 30;
export const FIXED_SOON_DAYS = 7;
export const MIN_LEAD_DAYS = 1;
export const MAX_LEAD_DAYS = 365;
const DEMO_EMAIL_SUFFIX = "@demo.doneunder.ai";

export type ReminderStep = "lead" | "7" | "0";
export type CertExpiryStatus = "ok" | "soon" | "today" | "expired" | "unknown";

export type ReminderCert = {
  id: string;
  name: string;
  expiryDate: string | null;
  confirmed: boolean;
};

export type ReminderCandidate = {
  diverId: string;
  email: string;
  username: string | null;
  fullName: string | null;
  enabled: boolean;
  leadDays: number;
  certs: ReminderCert[];
  sentKeys: string[];
};

export type PlannedReminder = {
  diverId: string;
  username: string | null;
  fullName: string | null;
  email: string;
  certificationId: string;
  certName: string;
  certNameKey: string;
  expiryDate: string;
  step: ReminderStep;
  daysUntil: number;
};

const DAY_MS = 86_400_000;

export function clampLeadDays(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_LEAD_DAYS;
  return Math.min(MAX_LEAD_DAYS, Math.max(MIN_LEAD_DAYS, Math.round(value)));
}

/** Calendar day YYYY-MM-DD in Europe/Berlin. */
export function calendarDateInTimeZone(now: Date, timeZone = CERT_EXPIRY_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function daysUntilExpiry(
  expiryDate: string | null | undefined,
  now = new Date(),
  timeZone = CERT_EXPIRY_TIMEZONE,
) {
  if (!expiryDate?.trim()) return null;
  const exp = expiryDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) return null;
  const today = calendarDateInTimeZone(now, timeZone);
  const expUtc = Date.parse(`${exp}T00:00:00Z`);
  const todayUtc = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(expUtc) || Number.isNaN(todayUtc)) return null;
  return Math.round((expUtc - todayUtc) / DAY_MS);
}

export function certExpiryStatus(days: number | null, leadDays: number): CertExpiryStatus {
  if (days === null) return "unknown";
  if (days < 0) return "expired";
  if (days === 0) return "today";
  const soonWindow = Math.min(clampLeadDays(leadDays), SOON_BADGE_CAP_DAYS);
  if (days <= soonWindow) return "soon";
  return "ok";
}

export function certExpiryLabel(status: CertExpiryStatus) {
  if (status === "soon") return "Expires soon";
  if (status === "today") return "Expires today";
  if (status === "expired") return "Expired";
  return null;
}

export function certNameKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isReminderCert(name: string | null | undefined, expiryDate: string | null | undefined) {
  const trimmed = name?.trim() ?? "";
  if (!trimmed || trimmed.toLowerCase() === "not provided") return false;
  return Boolean(expiryDate?.trim());
}

export function isSkippedReminderAccount(input: { email?: string | null; username?: string | null }) {
  const email = input.email?.trim().toLowerCase() ?? "";
  const username = input.username?.trim().toLowerCase() ?? "";
  if (email.endsWith(DEMO_EMAIL_SUFFIX)) return true;
  if (username.endsWith("-demo") || username.endsWith("-test")) return true;
  return false;
}

export function reminderSentKey(input: {
  diverId: string;
  certName: string;
  expiryDate: string;
  step: ReminderStep;
}) {
  return [input.diverId, certNameKey(input.certName), input.expiryDate.slice(0, 10), input.step].join("|");
}

/**
 * Steps still due for one certificate.
 * `lead` (diver setting, default 30) fires while days left are 8..lead.
 * `7` fires while days left are 1..7.
 * `0` fires on the expiry day, or once after it if that day was missed.
 * A lead of 7 or less is covered by the fixed 7-day email.
 */
export function dueReminderSteps(input: {
  daysUntil: number | null;
  leadDays: number;
  enabled: boolean;
  alreadySent?: ReminderStep[];
}) {
  if (!input.enabled || input.daysUntil === null) return [] as ReminderStep[];
  const lead = clampLeadDays(input.leadDays);
  const sent = new Set(input.alreadySent ?? []);
  const days = input.daysUntil;
  const due: ReminderStep[] = [];

  if (lead > FIXED_SOON_DAYS && days <= lead && days > FIXED_SOON_DAYS && !sent.has("lead")) {
    due.push("lead");
  }
  if (days <= FIXED_SOON_DAYS && days > 0 && !sent.has("7")) {
    due.push("7");
  }
  if (days <= 0 && !sent.has("0")) {
    due.push("0");
  }
  return due;
}

export function planCertExpiryReminders(candidates: ReminderCandidate[], now = new Date()) {
  const planned: PlannedReminder[] = [];

  for (const candidate of candidates) {
    if (!candidate.enabled) continue;
    if (isSkippedReminderAccount(candidate)) continue;
    const sent = new Set(candidate.sentKeys);
    const leadDays = clampLeadDays(candidate.leadDays);

    for (const cert of candidate.certs) {
      if (!cert.confirmed) continue;
      if (!isReminderCert(cert.name, cert.expiryDate)) continue;
      const expiryDate = cert.expiryDate!.trim().slice(0, 10);
      const daysUntil = daysUntilExpiry(expiryDate, now);
      const alreadySent = (["lead", "7", "0"] as const).filter((step) =>
        sent.has(reminderSentKey({ diverId: candidate.diverId, certName: cert.name, expiryDate, step })),
      );
      for (const step of dueReminderSteps({ daysUntil, leadDays, enabled: true, alreadySent })) {
        planned.push({
          diverId: candidate.diverId,
          username: candidate.username,
          fullName: candidate.fullName,
          email: candidate.email,
          certificationId: cert.id,
          certName: cert.name.trim(),
          certNameKey: certNameKey(cert.name),
          expiryDate,
          step,
          daysUntil: daysUntil!,
        });
      }
    }
  }

  return planned;
}

export function reminderGreetingName(fullName?: string | null) {
  const name = fullName?.trim() ?? "";
  if (!name || name.includes("@")) return "there";
  return name.split(/\s+/)[0] || "there";
}

export function reminderEmailCopy(input: {
  certName: string;
  expiryDate: string;
  step: ReminderStep;
  daysUntil: number;
  fullName?: string | null;
}) {
  const who = reminderGreetingName(input.fullName);
  const when =
    input.step === "0"
      ? `expires today (${input.expiryDate})`
      : `expires on ${input.expiryDate} (${input.daysUntil} day${input.daysUntil === 1 ? "" : "s"} from today)`;
  const subject = input.step === "0" ? `${input.certName} expires today` : `${input.certName} expires in ${input.daysUntil} days`;
  const body = [
    `Hi ${who},`,
    "",
    `Your ${input.certName} ${when}.`,
    input.step === "0"
      ? "It is still current today. Update the date in your DoneUnder workspace after you renew it."
      : "Renew it before it lapses, then update the date in your DoneUnder workspace.",
    "",
    "— Hermes",
  ].join("\n");
  return { subject, body };
}

export function reminderLogContent(input: {
  certName: string;
  expiryDate: string;
  step: ReminderStep;
  daysUntil: number;
}) {
  if (input.step === "0") {
    return `Reminder logged: ${input.certName} expires today (${input.expiryDate}).`;
  }
  return `Reminder logged: ${input.certName} expires on ${input.expiryDate} (${input.daysUntil} days, step ${input.step}).`;
}

export function publicReminderSummary(item: PlannedReminder) {
  return {
    username: item.username,
    certName: item.certName,
    expiryDate: item.expiryDate,
    step: item.step,
    daysUntil: item.daysUntil,
  };
}
