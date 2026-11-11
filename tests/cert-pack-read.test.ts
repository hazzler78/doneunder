import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  cvLooksLikeCertificatePack,
  describePackReport,
  planPackBatches,
  runPackRead,
  TEXT_BATCH_CHARS,
} from "../lib/cert-pack-read";
import {
  certificateReadMatchesStoredTicket,
  normalizeRead,
  readPdfCertificatePack,
  type CertificateRead,
} from "../lib/cert-text";
import { buildCertificateUploadAssistantReply } from "../lib/certificate-upload-reply";
import { extractPdfPageTexts } from "../lib/pdf-text";

function fakeRead(name: string, page: number): CertificateRead {
  return normalizeRead({ name, page, excerpt: name, source: "pdf-text", unreadable: false });
}

function pagesInText(text: string) {
  return [...text.matchAll(/=== Page (\d+) ===/g)].map((match) => Number(match[1]));
}

async function buildPackPdf(pageCount: number, charsPerPage: number) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let page = 1; page <= pageCount; page += 1) {
    const pdfPage = doc.addPage([595, 842]);
    const line = `Ticket ${page} certificate number DU-${1000 + page} valid until 01/01/2030. `;
    const body = line.repeat(Math.ceil(charsPerPage / line.length)).slice(0, charsPerPage);
    // Wrap into lines so the text stays on the page.
    const lines = body.match(/.{1,95}/g) ?? [];
    lines.forEach((text, index) => {
      pdfPage.drawText(text, { x: 20, y: 820 - index * 9, size: 7, font });
    });
  }
  return Buffer.from(await doc.save());
}

describe("planPackBatches", () => {
  it("splits a long text pack into batches without dropping any page", () => {
    const pages = Array.from({ length: 30 }, (_, index) => `Certificate page ${index + 1} `.repeat(80));
    const plan = planPackBatches(pages, 30);
    const covered = plan.batches.flatMap((batch) => batch.pages);
    assert.deepEqual([...new Set(covered)].sort((a, b) => a - b), Array.from({ length: 30 }, (_, i) => i + 1));
    assert.ok(plan.batches.length > 1, "30 long pages need more than one model call");
    for (const batch of plan.batches) {
      if (batch.kind === "text") assert.ok(batch.text.length <= TEXT_BATCH_CHARS);
    }
    assert.equal(plan.overCapPages.length, 0);
  });

  it("sends scanned pages to vision and text pages to text", () => {
    const pages = ["", "IMCA certificate ".repeat(10), "", ""];
    const plan = planPackBatches(pages, 4);
    const vision = plan.batches.filter((batch) => batch.kind === "vision").flatMap((batch) => batch.pages);
    const text = plan.batches.filter((batch) => batch.kind === "text").flatMap((batch) => batch.pages);
    assert.deepEqual(vision, [1, 3, 4]);
    assert.deepEqual(text, [2]);
  });

  it("keeps all of a very long page by splitting it into labelled parts", () => {
    const long = "x".repeat(TEXT_BATCH_CHARS * 2 + 10);
    const plan = planPackBatches([long], 1);
    const parts = plan.batches.filter((batch) => batch.kind === "text");
    assert.ok(parts.length >= 3);
    const total = parts.reduce((sum, batch) => sum + (batch.kind === "text" ? batch.text.replace(/=== Page 1 ===( \(continued\))?\n/, "").length : 0), 0);
    assert.equal(total, long.length);
  });

  it("reports pages over the cap instead of dropping them silently", () => {
    const plan = planPackBatches(Array(5).fill("text ".repeat(30)), 5, { maxPages: 3 });
    assert.deepEqual(plan.overCapPages, [4, 5]);
  });
});

describe("runPackRead", () => {
  it("reads every batch and returns a complete report", async () => {
    const plan = planPackBatches(Array.from({ length: 12 }, (_, i) => `Page ${i + 1} cert `.repeat(40)), 12, {
      textBatchChars: 1_500,
    });
    const result = await runPackRead(plan, {
      readText: async (_text, pages) => pages.map((page) => fakeRead(`Ticket ${page}`, page)),
      readImages: async () => [],
    });
    assert.equal(result.report.complete, true);
    assert.equal(result.report.pagesRead.length, 12);
    assert.equal(result.reads.length, 12);
  });

  it("reports failed pages and does not swallow the error", async () => {
    const plan = planPackBatches(["", "", "", "", "", ""], 6, { visionPagesPerBatch: 3 });
    const originalError = console.error;
    console.error = () => {};
    try {
      const result = await runPackRead(plan, {
        readText: async () => [],
        readImages: async (pages) => {
          if (pages.includes(4)) throw new Error("model timeout");
          return pages.map((page) => fakeRead(`Scan ${page}`, page));
        },
      });
      assert.equal(result.report.complete, false);
      assert.deepEqual(result.report.pagesFailed, [4, 5, 6]);
      assert.deepEqual(result.report.pagesRead, [1, 2, 3]);
      assert.match(result.report.errors.join(" "), /model timeout/);
      assert.equal(result.reads.length, 3);
    } finally {
      console.error = originalError;
    }
  });

  it("stops at the deadline and lists the unread pages", async () => {
    let clock = 0;
    const plan = planPackBatches(["", "", "", "", "", ""], 6, { visionPagesPerBatch: 2 });
    const result = await runPackRead(
      plan,
      {
        readText: async () => [],
        readImages: async (pages) => {
          clock += 1_000;
          return pages.map((page) => fakeRead(`Scan ${page}`, page));
        },
        now: () => clock,
      },
      { deadlineMs: 1_500, concurrency: 1 },
    );
    assert.equal(result.report.complete, false);
    assert.deepEqual(result.report.pagesRead, [1, 2, 3, 4]);
    assert.deepEqual(result.report.pagesSkipped, [5, 6]);
    assert.match(result.report.errors.join(" "), /out of time/i);
  });
});

describe("readPdfCertificatePack on a real multi-page PDF", () => {
  it("reads all 30 pages of a pack with more than 24,000 characters", async () => {
    const pdf = await buildPackPdf(30, 1_400);
    const texts = await extractPdfPageTexts(pdf);
    assert.equal(texts.totalPages, 30);
    const totalChars = texts.pages.reduce((sum, page) => sum + page.length, 0);
    assert.ok(totalChars > 24_000, `expected > 24k chars, got ${totalChars}`);

    const seenPages: number[] = [];
    const result = await readPdfCertificatePack(pdf, { filename: "pack.pdf" }, undefined, {
      aiConfigured: () => true,
      readText: async (text) => {
        const pages = pagesInText(text);
        seenPages.push(...pages);
        return pages.map((page) => fakeRead(`Ticket ${page}`, page));
      },
      readImages: async () => {
        throw new Error("no scanned pages expected");
      },
    });
    assert.equal(result.report.complete, true);
    assert.equal(result.report.totalPages, 30);
    assert.equal(result.report.pagesRead.length, 30);
    assert.deepEqual([...new Set(seenPages)].sort((a, b) => a - b), Array.from({ length: 30 }, (_, i) => i + 1));
    assert.equal(result.reads.length, 30);
    assert.equal(describePackReport("pack.pdf", result.report), "Read all 30 pages of pack.pdf.");
  });

  it("reports an unreadable file instead of returning an empty success", async () => {
    const originalError = console.error;
    console.error = () => {};
    try {
      const result = await readPdfCertificatePack(Buffer.from("not a pdf"), { filename: "broken.pdf" }, undefined, {
        aiConfigured: () => true,
        pageTexts: async () => ({ totalPages: 0, pages: [], error: "Invalid PDF structure" }),
        readText: async () => [],
        readImages: async () => [],
      });
      assert.equal(result.report.complete, false);
      assert.equal(result.report.totalPages, 0);
      assert.match(describePackReport("broken.pdf", result.report) ?? "", /could not open/i);
    } finally {
      console.error = originalError;
    }
  });
});

describe("diver-facing messages for incomplete reads", () => {
  it("tells the diver which pages were not read", () => {
    const reply = buildCertificateUploadAssistantReply([
      {
        name: "all-tickets.pdf",
        action: "added",
        ticketCount: 5,
        tickets: [{ name: "IMCA Diver" }],
        readReport: {
          totalPages: 40,
          pagesRead: Array.from({ length: 30 }, (_, i) => i + 1),
          pagesSkipped: Array.from({ length: 10 }, (_, i) => i + 31),
          pagesFailed: [],
          errors: [],
          complete: false,
        },
      },
    ]);
    assert.match(reply.content, /Read 30 of 40 pages of all-tickets\.pdf/);
    assert.match(reply.content, /Pages 31–40 were not read yet/);
    assert.equal(reply.incompleteReads, 1);
  });

  it("passes on a rejected expiry-before-issue date", () => {
    const reply = buildCertificateUploadAssistantReply([
      {
        name: "medical.pdf",
        action: "added",
        ticketCount: 1,
        tickets: [{ name: "HSE Diver Medical" }],
        readWarnings: ["Expiry 2022-08-12 is before issue 2026-05-31 for HSE Diver Medical. The expiry was not saved."],
      },
    ]);
    assert.match(reply.content, /before issue 2026-05-31/);
  });
});

describe("normalizeRead date sanity", () => {
  it("rejects an expiry before the issue date", () => {
    const read = normalizeRead({
      name: "HSE Diver Medical",
      issue_date: "31/05/2026",
      expiry_date: "12/08/2022",
      source: "vision",
    });
    assert.equal(read.issue_date, "2026-05-31");
    assert.equal(read.expiry_date, null);
    assert.match(read.date_warning ?? "", /before issue/);
  });
});

describe("certificateReadMatchesStoredTicket (no fuzzy merge)", () => {
  it("does not merge different tickets that share words", () => {
    assert.equal(
      certificateReadMatchesStoredTicket(
        { name: "IMCA Surface Supplied Diver", issuing_body: "IMCA" },
        { names: ["IMCA Diver Medic Technician"], issuing_body: "IMCA" },
      ),
      false,
    );
    assert.equal(
      certificateReadMatchesStoredTicket({ name: "HSE Diver Medical" }, { names: ["HSE Surface Supplied Diver"] }),
      false,
    );
  });

  it("matches the same ticket by title or certificate number", () => {
    assert.equal(
      certificateReadMatchesStoredTicket({ name: "OPITO FOET" }, { names: ["opito  foet"] }),
      true,
    );
    assert.equal(
      certificateReadMatchesStoredTicket(
        { name: "Surface Supplied Top Up", cert_number: "A-12345" },
        { names: ["HSE Part 1"], cert_number: "a12345" },
      ),
      true,
    );
  });

  it("refuses a same-title match when issuers clearly differ", () => {
    assert.equal(
      certificateReadMatchesStoredTicket(
        { name: "Commercial Diver Certificate", issuing_body: "Petroleum Safety Authority Norway" },
        { names: ["Commercial Diver Certificate"], issuing_body: "Danish Maritime Authority" },
      ),
      false,
    );
  });

  it("refuses a match when both certificate numbers exist and differ", () => {
    assert.equal(
      certificateReadMatchesStoredTicket(
        { name: "HSE Diver Medical", cert_number: "M-1" },
        { names: ["HSE Diver Medical"], cert_number: "M-2" },
      ),
      false,
    );
  });
});

describe("cvLooksLikeCertificatePack", () => {
  it("detects a CV followed by certificate pages", () => {
    const cv = "Professional experience as an offshore air diver with IMCA tickets. ".repeat(60);
    const ticket = "This is to certify that Jane Diver has successfully completed IMCA Surface Supplied. Date of issue 01/02/2020.";
    assert.equal(cvLooksLikeCertificatePack([cv, cv, ticket, ticket, ""]), true);
  });

  it("does not treat a normal multi-page CV as a pack", () => {
    const cv = "Professional experience as an offshore air diver with IMCA tickets and HSE medical. ".repeat(60);
    assert.equal(cvLooksLikeCertificatePack([cv, cv, cv, cv]), false);
    assert.equal(cvLooksLikeCertificatePack(["", "", "", ""]), false);
  });
});
