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
};

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

  const parts = [
    added.length ? `New file(s): ${added.join(", ")}.` : "",
    renewed.length ? `Renewed: ${renewed.join(", ")}.` : "",
    duplicates.length ? `Already on file: ${duplicates.join(", ")}.` : "",
    dated.length ? `Read ${dated.length} ticket(s) from the upload: ${dated.join("; ")}.` : "",
    ...unreadNotes,
  ].filter(Boolean);

  const intro =
    parts.join(" ") ||
    (files.length ? `Stored ${files.length} certificate file(s).` : "Stored certificate file(s).");

  const tail =
    dated.length > 0
      ? "One PDF can contain many tickets — Hermes reads each one. Job history on the living CV only changes when you upload a CV PDF or tell me a job to add. If an expiry is missing, type the date. Then say match me to open campaigns."
      : zeroReadFiles.length > 0
        ? "Your file is stored. Send a sharper photo or the PDF, or type the ticket name and expiry. Then say match me to open campaigns."
        : "One PDF can contain many tickets — Hermes reads each one. Job history on the living CV only changes when you upload a CV PDF or tell me a job to add. Then say match me to open campaigns.";

  return {
    content: `${intro} ${tail}`.replace(/\s+/g, " ").trim(),
    ticketsRead: dated.length,
    zeroReadFilenames: zeroReadFiles.map((file) => file.name),
  };
}
