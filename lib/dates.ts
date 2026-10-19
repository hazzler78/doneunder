const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number) {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Parse dates. Ambiguous numeric dates are day/month/year (European). */
export function parseFlexibleDate(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (["present", "current", "ongoing", "to date", "now", "n/a", "na"].includes(lower)) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
  // A year alone is not a day. "2026" must not become 1 January.
  if (/^\d{4}$/.test(trimmed)) return null;

  const numeric = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const yearRaw = numeric[3];
    const year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw);
    // Always prefer day/month/year. 05/01/2027 = 5 January 2027.
    return isoDate(year, second, first);
  }

  const monthName = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$/);
  if (monthName) {
    const month = MONTHS[monthName[2].toLowerCase()];
    const year = monthName[3].length === 2 ? 2000 + Number(monthName[3]) : Number(monthName[3]);
    if (month) return isoDate(year, month, Number(monthName[1]));
  }

  const monthFirst = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1].toLowerCase()];
    const year = monthFirst[3].length === 2 ? 2000 + Number(monthFirst[3]) : Number(monthFirst[3]);
    if (month) return isoDate(year, month, Number(monthFirst[2]));
  }

  const monthYear = trimmed.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monthYear) {
    const month = MONTHS[monthYear[1].toLowerCase()];
    if (month) return isoDate(Number(monthYear[2]), month, 1);
  }

  return null;
}

/** True when a stored expiry is only a year that was saved as 1 January. */
export function isYearPlaceholderExpiry(value?: string | null) {
  if (!value?.trim()) return false;
  return /^\d{4}-01-01(?:$|T)/.test(value.trim());
}

const YEAR_SPAN = /\b((?:19|20)\d{2})\s*(?:-|–|—|\bto\b)\s*((?:19|20)\d{2})\b/i;

/** A printed range such as 2025–2027. Issue is the start year; expiry is the end of the last year. */
export function yearSpanInText(text?: string | null) {
  if (!text) return null;
  const match = text.match(YEAR_SPAN);
  if (!match?.[1] || !match[2]) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (end < start || end - start > 15) return null;
  return {
    issue_date: `${match[1]}-01-01`,
    expiry_date: `${match[2]}-12-31`,
  };
}

/** Show a year-only date as the year. Full dates keep day and month. */
export function formatCertificateDate(value?: string | null) {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (/^\d{4}-(?:01-01|12-31)(?:$|T)/.test(trimmed)) return trimmed.slice(0, 4);
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function contextLineForCertificate(markdown: string | null | undefined, name: string) {
  if (!markdown?.trim() || !name.trim()) return null;
  const words = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4);
  if (words.length === 0) return null;
  const needed = Math.min(2, words.length);
  for (const line of markdown.split(/\n/)) {
    const lower = line.toLowerCase();
    const hits = words.filter((word) => lower.includes(word)).length;
    if (hits >= needed && yearSpanInText(line)) return line;
  }
  return null;
}

export function resolveCertificateDates(input: {
  name?: string | null;
  issuingBody?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  context?: string | null;
}) {
  let issue = input.issueDate?.trim() || null;
  let expiry = input.expiryDate?.trim() || null;
  if (!issue || !expiry) {
    const span = yearSpanInText([input.name, input.issuingBody, input.issueDate, input.expiryDate, input.context].filter(Boolean).join("\n"));
    if (span) {
      issue = issue || span.issue_date;
      expiry = expiry || span.expiry_date;
    }
  }
  return { issue_date: issue, expiry_date: expiry };
}

export function extractCertificateDates(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const squeezed = text.replace(/\s+/g, "");

  // Common CV-import junk: "19-10-2024 expiry 19-10-2026" or "08-04-2026 expiry 29-04-2027"
  const pair = compact.match(
    /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}\s+[A-Za-z]+\s+\d{2,4})\s*(?:expiry|expires|valid until|valid to|to)\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}\s+[A-Za-z]+\s+\d{2,4})/i,
  );
  if (pair) {
    return {
      issue_date: parseFlexibleDate(pair[1] ?? null),
      expiry_date: parseFlexibleDate(pair[2] ?? null),
    };
  }

  const expiryMatch =
    squeezed.match(/CertificateExpiryDate[:\-]?(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i) ||
    squeezed.match(/(?:ExpiryDate|ValidUntil|ValidTo|GiltigTill|Utgangsdatum)[:\-]?(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i) ||
    compact.match(
      /(?:expiry|expires|valid until|valid to|valid thru|giltig till)[:\s\-]*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}\s+[A-Za-z]+\s+\d{2,4}|[A-Za-z]+\s+\d{4})/i,
    );

  const issueMatch =
    squeezed.match(/(?:DateofIssue|Issued|IssueDate|From)[:\-]?(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i) ||
    compact.match(
      /(?:issued|issue date|date of issue|from)[:\s\-]*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}\s+[A-Za-z]+\s+\d{2,4}|[A-Za-z]+\s+\d{4})/i,
    );

  const span = yearSpanInText(compact);
  return {
    issue_date: parseFlexibleDate(issueMatch?.[1] ?? null) || span?.issue_date || null,
    expiry_date: parseFlexibleDate(expiryMatch?.[1] ?? null) || span?.expiry_date || null,
  };
}
