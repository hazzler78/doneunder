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
  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;

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

export function extractCertificateDates(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const squeezed = text.replace(/\s+/g, "");

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

  return {
    issue_date: parseFlexibleDate(issueMatch?.[1] ?? null),
    expiry_date: parseFlexibleDate(expiryMatch?.[1] ?? null),
  };
}
