/**
 * Lifetime (no-expiry) certificate rules.
 *
 * Commercial diving competence tickets (HSE, IMCA, ADAS, IDSA, closed/wet bell, scuba,
 * ALST, supervisor, Norwegian, Danish, Dutch, Swedish and French CAH approvals, welding,
 * chamber operator, driving/boat licences) do not expire. Medicals, survival training
 * (BOSIET/FOET/HUET/EBS), GWO, DMT, H2S, MIST, CSWIP, STCW and first aid do.
 *
 * Aligned with /workspace/du_match/match.py (1 Nov 2026) plus Danish diving tickets.
 * An explicit `no_expiry` flag on the row always wins over the name rule.
 */

export type LifetimeCertInput = {
  name?: string | null;
  issuing_body?: string | null;
  no_expiry?: boolean | null;
};

/** Ticket families that normally expire. Checked first, so "HSE Diver Medical" stays expiring. */
const EXPIRING_PATTERNS: RegExp[] = [
  /medical(?! technician)(?! training)/,
  /fitness (to dive|certificate)/,
  /\b(oeuk|oguk)\b/,
  /\bbosiet\b/,
  /\bfoet\b/,
  /further offshore emergency/,
  /offshore (survival|emergency)/,
  /opito survival/,
  /sea survival/,
  /\bhuet\b/,
  /\bca[\s-]*ebs\b/,
  /\bebs\b/,
  /escape chute/,
  /\bgwo\b/,
  /\bdmt\b/,
  /\bdiver? medic\b/,
  /\bdiving medic\b/,
  /\bdive medical technician\b/,
  /\bdiver medical technician\b/,
  /\bh2s\b/,
  /\bmist\b/,
  /minimum industry safety/,
  /\bcswip\b/,
  /\b3\.[124]u\b/,
  /underwater inspector/,
  /\bstcw\b/,
  /first aid/,
  /oxygen (provider|administration|admin)/,
  /\baed\b/,
  /\bpassport\b/,
  /seaman'?s? book/,
];

/** Lifetime ticket families (match.py non-expiring keys + Danish). */
const LIFETIME_PATTERNS: RegExp[] = [
  // closed_bell / sat
  /closed[\s-]*bell/,
  /mixed[\s-]*gas/,
  /saturation/,
  /\bsat diver\b/,
  // wet bell
  /wet[\s-]*bell/,
  // HSE / IMCA / ADAS / IDSA diving tickets
  /\bhse part (1|2|3|4|i|ii|iii|iv)\b/,
  /\bhse\b.*\b(diver|diving|scuba|surface|air|closed|commercial|professional|top[\s-]*up)\b/,
  /\b(diver|diving)\b.*\bhse\b/,
  /\bimca\b/,
  /\badas\b/,
  /\bidsa\b/,
  /top[\s-]*up/,
  /surface[\s-]*suppl(y|ied)/,
  /surface[\s-]*orient\w*/,
  /\bssde\b/,
  /commercial (air )?diver/,
  /construction diver/,
  /diver engaged in underwater civil/,
  /cdni air diving/,
  /diving permit class/,
  /class[\s-]*(i|ii|iii|iv|1|2|3|4)\b.*\bdiv(er|ing)\b/,
  // scuba (commercial)
  /\bscuba\b/,
  // ALST
  /\balst\b/,
  /assistant life support/,
  // supervisors (incl. trainee)
  /supervisor/,
  // Norway
  /petroleum safety authority/,
  /petroleumstilsynet/,
  /arbeidstilsynet/,
  /directorate of labou?r insp/,
  /\bklasse b\b/,
  /\bnorw(ay|egian)\b.*\b(div(er|ing)|dykk\w*|class b)\b/,
  /\b(div(er|ing)|dykk\w*)\b.*\bnorw(ay|egian)\b/,
  // Denmark (not in match.py; added here)
  /\bdan(ish|mark)\b.*\b(div(er|ing)|dykk\w*)\b/,
  /\b(div(er|ing)|dykk\w*)\b.*\b(danish|denmark)\b/,
  /erhvervsdykker/,
  /dykkercertifikat/,
  /dykkerbevis/,
  /arbejdstilsynet/,
  // Netherlands
  /\bdutch\b.*\b(b4|div(er|ing))\b/,
  /duikarbeid/,
  /\bb4\b/,
  /\bawd\b/,
  // Sweden
  /swedish cert\w* of diving/,
  /\bswed(ish|en)\b.*\bdiv(er|ing)\b/,
  /yrkesdykare/,
  // France CAH (certificat d'aptitude à l'hyperbarie)
  /aptitude .*hyperbar/,
  /\bcah\b/,
  /hyperbarie/,
  // welding
  /underwater weld/,
  /welder[\s-]*diver/,
  /\b15618\b/,
  /\bd3\.6\b/,
  // chamber operator
  /chamber op(erat\w*)?/,
  /\bsurd\s*o2\b/,
  // licences
  /driving licen[cs]e/,
  /f[øo]rerkort/,
  /\bd6\b/,
  /powerboat/,
  /skipper/,
  /boat (professional|licen[cs]e)/,
  /b[åa]tf[øo]rer/,
];

function haystack(input: LifetimeCertInput) {
  return [input.name, input.issuing_body]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

/** Name/issuer rule only, ignoring any stored flag. */
export function isLifetimeTicketType(input: LifetimeCertInput) {
  const text = haystack(input);
  if (!text || text === "not provided" || text === "certification") return false;
  if (EXPIRING_PATTERNS.some((pattern) => pattern.test(text))) return false;
  return LIFETIME_PATTERNS.some((pattern) => pattern.test(text));
}

/** True when this ticket never needs an expiry date (explicit flag wins over the name rule). */
export function isLifetimeCertificate(input: LifetimeCertInput) {
  if (input.no_expiry === true) return true;
  if (input.no_expiry === false) return false;
  return isLifetimeTicketType(input);
}

function hasDate(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  return Boolean(trimmed) && trimmed.toLowerCase() !== "not provided";
}

/** True when the ticket expires and no expiry date is on file. Lifetime tickets never need one. */
export function certificateNeedsExpiryDate(input: LifetimeCertInput & { expiry_date?: string | null }) {
  const name = input.name?.trim() ?? "";
  if (!name || name.toLowerCase() === "not provided") return false;
  if (isLifetimeCertificate(input)) return false;
  return !hasDate(input.expiry_date);
}

export type CertificateDateCheck = {
  issue_date: string | null;
  expiry_date: string | null;
  /** Set when the read expiry came before the issue date and was dropped. */
  rejected_expiry_date: string | null;
  warning: string | null;
};

function isoDay(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  return /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : null;
}

/**
 * An expiry before the issue date is a misread (often a wrong year or day/month swap).
 * Drop the expiry instead of saving the ticket as expired.
 */
export function checkCertificateDates(input: {
  name?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
}): CertificateDateCheck {
  const issue = input.issue_date ?? null;
  const expiry = input.expiry_date ?? null;
  const issueDay = isoDay(issue);
  const expiryDay = isoDay(expiry);
  if (issueDay && expiryDay && expiryDay < issueDay) {
    const label = input.name?.trim() || "this ticket";
    return {
      issue_date: issue,
      expiry_date: null,
      rejected_expiry_date: expiryDay,
      warning:
        `Expiry ${expiryDay} is before issue ${issueDay} for ${label}. ` +
        "The expiry was not saved. Check the certificate and type the right date.",
    };
  }
  return { issue_date: issue, expiry_date: expiry, rejected_expiry_date: null, warning: null };
}

/** Short status line for checklists and Hermes context. */
export function certificateExpiryRequirement(
  input: LifetimeCertInput & { expiry_date?: string | null },
): "lifetime" | "dated" | "needs_expiry" {
  if (isLifetimeCertificate(input) && !hasDate(input.expiry_date)) return "lifetime";
  if (hasDate(input.expiry_date)) return "dated";
  return certificateNeedsExpiryDate(input) ? "needs_expiry" : "lifetime";
}
