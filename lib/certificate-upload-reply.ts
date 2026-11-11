import { describePackReport, type CertificatePackReport } from "@/lib/cert-pack-read";

export type CertificateUploadSummaryFile = {
  name: string;
  action?: string;
  ticket?: string | null;
  expiry_date?: string | null;
  issue_date?: string | null;
  ticketCount?: number;
  tickets?: Array<{
    name?: string | null;
    expiry_date?: string | null;
    issue_date?: string | null;
  }>;
  readReport?: CertificatePackReport | null;
  readWarnings?: string[];
};

function sanitizeReport(value: unknown): CertificatePackReport | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const pages = (input: unknown) =>
    Array.isArray(input) ? input.filter((page): page is number => Number.isInteger(page) && page > 0).slice(0, 500) : [];
  const totalPages = typeof raw.totalPages === "number" && raw.totalPages >= 0 ? Math.floor(raw.totalPages) : null;
  return {
    totalPages,
    pagesRead: pages(raw.pagesRead),
    pagesSkipped: pages(raw.pagesSkipped),
    pagesFailed: pages(raw.pagesFailed),
    errors: [],
    complete: raw.complete === true,
  };
}

/** Notes for files that were only partly read. Exported for tests. */
export function incompleteReadNotes(files: CertificateUploadSummaryFile[]) {
  return files
    .map((file) => describePackReport(file.name, sanitizeReport(file.readReport)))
    .filter((note): note is string => Boolean(note));
}

function ticketsReadFromFile(file: CertificateUploadSummaryFile) {
  const explicit = typeof file.ticketCount === "number" ? file.ticketCount : null;
  if (explicit !== null) return explicit;
  if (Array.isArray(file.tickets)) return file.tickets.length;
  if (file.ticket || file.expiry_date || file.issue_date) return 1;
  return 0;
}

export function certificateUploadFilesWithZeroReads(files: CertificateUploadSummaryFile[]) {
  return files.filter((file) => ticketsReadFromFile(file) === 0);
}

export function buildCertificateUploadAssistantReply(files: CertificateUploadSummaryFile[]) {
  const added = files.filter((item) => item.action === "added").map((item) => item.name);
  const renewed = files.filter((item) => item.action === "renewed").map((item) => item.name);
  const duplicates = files.filter((item) => item.action === "duplicate").map((item) => item.name);
  const dated = files.flatMap((item) => {
    const tickets = Array.isArray(item.tickets) ? item.tickets : null;
    if (tickets && tickets.length > 0) {
      return tickets.map((ticket) => {
        const label = ticket.name || item.ticket || item.name;
        return ticket.expiry_date ? `${label} (exp ${ticket.expiry_date})` : label;
      });
    }
    if (item.ticket || item.expiry_date) {
      const label = item.ticket || item.name;
      return [item.expiry_date ? `${label} (exp ${item.expiry_date})` : label];
    }
    return [] as string[];
  });

  const zeroReadFiles = certificateUploadFilesWithZeroReads(files);
  const unreadNotes = zeroReadFiles.map(
    (file) =>
      `I couldn't read a ticket from ${file.name} — please send a sharper photo or the PDF, or type the ticket name and expiry.`,
  );

  const pageNotes = incompleteReadNotes(files);
  const dateNotes = files
    .flatMap((file) => (Array.isArray(file.readWarnings) ? file.readWarnings : []))
    .filter((note): note is string => typeof note === "string" && /before issue/i.test(note))
    .map((note) => note.slice(0, 240))
    .slice(0, 5);

  const parts = [
    added.length ? `New file(s): ${added.join(", ")}.` : "",
    renewed.length ? `Renewed: ${renewed.join(", ")}.` : "",
    duplicates.length ? `Already on file: ${duplicates.join(", ")}.` : "",
    dated.length ? `Read ${dated.length} ticket(s) from the upload: ${dated.join("; ")}.` : "",
    ...unreadNotes,
    ...pageNotes,
    ...dateNotes,
  ].filter(Boolean);

  const intro =
    parts.join(" ") ||
    (files.length ? `Stored ${files.length} certificate file(s).` : "Stored certificate file(s).");

  const tail =
    dated.length > 0
      ? "One PDF can contain many tickets — Hermes reads each one. Job history on the living CV only changes when you upload a CV PDF or tell me a job to add. If a medical, BOSIET/FOET or other expiring ticket has no expiry, type the date. Lifetime tickets such as HSE, IMCA, Norwegian and Danish diving tickets need none. Then say match me to open campaigns."
      : zeroReadFiles.length > 0
        ? "Your file is stored. Send a sharper photo or the PDF, or type the ticket name and expiry. Then say match me to open campaigns."
        : "One PDF can contain many tickets — Hermes reads each one. Job history on the living CV only changes when you upload a CV PDF or tell me a job to add. Then say match me to open campaigns.";

  return {
    content: `${intro} ${tail}`.replace(/\s+/g, " ").trim(),
    ticketsRead: dated.length,
    zeroReadFilenames: zeroReadFiles.map((file) => file.name),
    incompleteReads: pageNotes.length,
  };
}
