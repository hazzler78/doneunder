/**
 * Page-by-page reading of large certificate packs (CV + many tickets in one PDF).
 *
 * Nothing is truncated silently: every page is either read, or reported as skipped
 * (over the page cap or out of time) or failed (reader error). The report goes back
 * to the diver so an incomplete read is never presented as complete.
 */
import type { CertificateRead } from "@/lib/cert-text";

/** Hard cap per file. Pages above it are reported as skipped, never dropped silently. */
export const MAX_PACK_PAGES = 80;
/** Text sent to the model per call. Big packs are split across several calls. */
export const TEXT_BATCH_CHARS = 16_000;
/** Scanned pages per vision call. */
export const VISION_PAGES_PER_BATCH = 3;
/** Pages with less text than this are treated as scans and read with vision. */
export const MIN_PAGE_TEXT_CHARS = 60;
/** Parallel model calls per file. */
export const PACK_READ_CONCURRENCY = 3;
/** Default time budget for one file (leaves room inside a 120 s function). */
export const DEFAULT_PACK_DEADLINE_MS = 75_000;

export type PackTextBatch = { kind: "text"; pages: number[]; text: string };
export type PackVisionBatch = { kind: "vision"; pages: number[] };
export type PackBatch = PackTextBatch | PackVisionBatch;

export type PackPlan = {
  totalPages: number;
  batches: PackBatch[];
  /** Pages over the page cap. */
  overCapPages: number[];
  maxPages: number;
};

export type CertificatePackReport = {
  /** Pages in the file. null for photos and Word files. */
  totalPages: number | null;
  pagesRead: number[];
  /** Not attempted: over the page cap or out of time. */
  pagesSkipped: number[];
  /** Attempted but the reader failed. */
  pagesFailed: number[];
  /** Short, secret-free reasons, for logs and the diver message. */
  errors: string[];
  complete: boolean;
};

export type CertificatePackRead = {
  reads: CertificateRead[];
  report: CertificatePackReport;
};

export type PackReaderDeps = {
  /** Extract certificates from labelled page text. Throw on failure; do not return [] for errors. */
  readText: (text: string, pages: number[]) => Promise<CertificateRead[]>;
  /** Extract certificates from rendered page images (same order as pages). Throw on failure. */
  readImages: (pages: number[]) => Promise<CertificateRead[]>;
  now?: () => number;
};

export type PackReadOptions = {
  deadlineMs?: number;
  concurrency?: number;
  maxPages?: number;
  textBatchChars?: number;
  visionPagesPerBatch?: number;
};

function pageHeader(page: number) {
  return `=== Page ${page} ===`;
}

/** Split one long page into labelled parts so nothing is cut off. */
function splitLongPage(page: number, text: string, limit: number) {
  const parts: string[] = [];
  const body = limit - pageHeader(page).length - 16;
  for (let start = 0; start < text.length; start += body) {
    parts.push(`${pageHeader(page)}${start > 0 ? " (continued)" : ""}\n${text.slice(start, start + body)}`);
  }
  return parts;
}

/** Decide which pages go to text calls and which go to vision calls. Pure. */
export function planPackBatches(
  pageTexts: string[],
  totalPages: number,
  options?: PackReadOptions,
): PackPlan {
  const maxPages = options?.maxPages ?? MAX_PACK_PAGES;
  const limit = options?.textBatchChars ?? TEXT_BATCH_CHARS;
  const perVision = options?.visionPagesPerBatch ?? VISION_PAGES_PER_BATCH;
  const total = Math.max(totalPages, pageTexts.length);
  const readable = Math.min(total, maxPages);
  const overCapPages = Array.from({ length: Math.max(0, total - readable) }, (_, index) => readable + index + 1);

  const batches: PackBatch[] = [];
  let textPages: number[] = [];
  let textParts: string[] = [];
  let textLength = 0;
  let visionPages: number[] = [];

  const flushText = () => {
    if (textParts.length === 0) return;
    batches.push({ kind: "text", pages: [...new Set(textPages)], text: textParts.join("\n\n") });
    textPages = [];
    textParts = [];
    textLength = 0;
  };
  const flushVision = () => {
    if (visionPages.length === 0) return;
    batches.push({ kind: "vision", pages: visionPages });
    visionPages = [];
  };

  for (let page = 1; page <= readable; page += 1) {
    const text = (pageTexts[page - 1] ?? "").trim();
    if (text.length < MIN_PAGE_TEXT_CHARS) {
      visionPages.push(page);
      if (visionPages.length >= perVision) flushVision();
      continue;
    }
    const labelled = `${pageHeader(page)}\n${text}`;
    if (labelled.length > limit) {
      flushText();
      for (const part of splitLongPage(page, text, limit)) {
        batches.push({ kind: "text", pages: [page], text: part });
      }
      continue;
    }
    if (textLength + labelled.length + 2 > limit) flushText();
    textPages.push(page);
    textParts.push(labelled);
    textLength += labelled.length + 2;
  }
  flushText();
  flushVision();

  return { totalPages: total, batches, overCapPages, maxPages };
}

function errorText(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  // Keep logs short and free of request bodies or keys.
  return raw.replace(/(sk|xai|key)[-_][A-Za-z0-9_-]{8,}/g, "[redacted]").replace(/\s+/g, " ").slice(0, 160);
}

function pageRange(pages: number[]) {
  if (pages.length === 0) return "";
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const page of sorted.slice(1)) {
    if (page === prev + 1) {
      prev = page;
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = page;
    prev = page;
  }
  ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
  return ranges.join(", ");
}

export { pageRange as formatPageRanges };

function dedupeKey(read: CertificateRead) {
  return [
    (read.name || "").toLowerCase().replace(/\s+/g, " ").trim(),
    (read.issuing_body || "").toLowerCase().replace(/\s+/g, " ").trim(),
    (read.cert_number || "").toLowerCase(),
    typeof read.page === "number" && read.page > 0 ? String(read.page) : "",
    read.expiry_date || "",
    read.issue_date || "",
  ].join("|");
}

/** Run every batch with limited parallelism and a time budget. */
export async function runPackRead(
  plan: PackPlan,
  deps: PackReaderDeps,
  options?: PackReadOptions & { label?: string },
): Promise<CertificatePackRead> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const deadline = startedAt + (options?.deadlineMs ?? DEFAULT_PACK_DEADLINE_MS);
  const concurrency = Math.max(1, options?.concurrency ?? PACK_READ_CONCURRENCY);
  const label = options?.label ? ` (${options.label})` : "";

  const pagesRead = new Set<number>();
  const pagesFailed = new Set<number>();
  const pagesSkipped = new Set<number>(plan.overCapPages);
  const errors: string[] = [];
  const results: CertificateRead[][] = plan.batches.map(() => []);

  if (plan.overCapPages.length > 0) {
    errors.push(`Pages ${pageRange(plan.overCapPages)} are over the ${plan.maxPages}-page limit and were not read.`);
  }

  let next = 0;
  let timedOut = false;
  async function worker() {
    while (next < plan.batches.length) {
      const index = next;
      next += 1;
      const batch = plan.batches[index];
      if (now() >= deadline) {
        timedOut = true;
        batch.pages.forEach((page) => pagesSkipped.add(page));
        continue;
      }
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          results[index] =
            batch.kind === "text" ? await deps.readText(batch.text, batch.pages) : await deps.readImages(batch.pages);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (now() >= deadline) break;
        }
      }
      if (lastError) {
        const message = errorText(lastError);
        console.error(`Certificate pack read failed${label}, pages ${pageRange(batch.pages)}:`, message);
        errors.push(`Pages ${pageRange(batch.pages)} could not be read (${batch.kind}): ${message}`);
        batch.pages.forEach((page) => pagesFailed.add(page));
      } else {
        batch.pages.forEach((page) => pagesRead.add(page));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, plan.batches.length) }, () => worker()));

  // A page split into several text parts counts as read only if every part succeeded.
  for (const page of pagesFailed) pagesRead.delete(page);
  for (const page of pagesSkipped) pagesRead.delete(page);
  if (timedOut) {
    const skippedForTime = [...pagesSkipped].filter((page) => !plan.overCapPages.includes(page));
    if (skippedForTime.length > 0) {
      errors.push(`Ran out of time before pages ${pageRange(skippedForTime)}.`);
    }
  }

  const seen = new Set<string>();
  const reads: CertificateRead[] = [];
  for (const batch of results) {
    for (const read of batch) {
      if (!read.name && !read.expiry_date && !read.issue_date) continue;
      const key = dedupeKey(read);
      if (seen.has(key)) continue;
      seen.add(key);
      reads.push(read);
    }
  }

  const sortNumbers = (values: Iterable<number>) => [...values].sort((a, b) => a - b);
  const report: CertificatePackReport = {
    totalPages: plan.totalPages,
    pagesRead: sortNumbers(pagesRead),
    pagesSkipped: sortNumbers(pagesSkipped),
    pagesFailed: sortNumbers(pagesFailed),
    errors,
    complete: pagesSkipped.size === 0 && pagesFailed.size === 0 && plan.totalPages > 0,
  };
  return { reads, report };
}

/** One honest sentence for the diver about how much of a file was read. null when there is nothing to add. */
export function describePackReport(filename: string, report: CertificatePackReport | null | undefined) {
  if (!report || report.totalPages === null) return null;
  const total = report.totalPages;
  if (total === 0) {
    return `I could not open ${filename} to read its pages. Please send it again or as separate files.`;
  }
  const readCount = report.pagesRead.length;
  if (report.complete) {
    return total > 1 ? `Read all ${total} pages of ${filename}.` : null;
  }
  const parts = [`Read ${readCount} of ${total} pages of ${filename}.`];
  if (report.pagesFailed.length > 0) {
    parts.push(`Pages ${pageRange(report.pagesFailed)} could not be read.`);
  }
  if (report.pagesSkipped.length > 0) {
    parts.push(`Pages ${pageRange(report.pagesSkipped)} were not read yet.`);
  }
  parts.push(
    "Tickets on those pages are not on your profile. Ask me to read your certificates again, or send those pages as separate files.",
  );
  return parts.join(" ");
}

export function emptyPackReport(totalPages: number | null, error?: string): CertificatePackReport {
  return {
    totalPages,
    pagesRead: [],
    pagesSkipped: [],
    pagesFailed: totalPages ? Array.from({ length: totalPages }, (_, index) => index + 1) : [],
    errors: error ? [error] : [],
    complete: false,
  };
}

/** Wording printed on a ticket page (not just a CV line that mentions IMCA). */
const CERTIFICATE_PAGE_PATTERN =
  /\b(this is to certify|hereby certif|certificate (no|number|of)|certified that|valid until|valid to|date of issue|expiry date|date of expiry|expires on|fitness to dive|has successfully completed|has completed)\b/i;
/** Ticket pages are short; CV pages are long running text. */
const MAX_TICKET_PAGE_CHARS = 2_500;

/**
 * A "CV" PDF that is really a pack (CV + many tickets): at least two pages after the first
 * that are scans or short pages with certificate wording.
 */
export function cvLooksLikeCertificatePack(pageTexts: string[]) {
  if (pageTexts.length < 3) return false;
  // Scans only count after a text CV page (a fully scanned CV is not a pack by itself).
  const firstPageHasText = (pageTexts[0] ?? "").trim().length >= MIN_PAGE_TEXT_CHARS;
  const ticketPages = pageTexts.slice(1).filter((raw) => {
    const text = raw.trim();
    if (text.length < MIN_PAGE_TEXT_CHARS) return firstPageHasText;
    return text.length <= MAX_TICKET_PAGE_CHARS && CERTIFICATE_PAGE_PATTERN.test(text);
  });
  return ticketPages.length >= 2;
}
