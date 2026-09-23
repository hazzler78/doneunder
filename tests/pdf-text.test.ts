import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import { renderPdfPagesAsImages } from "../lib/pdf-ocr";
import { extractPdfText, joinSingleCharacterLines } from "../lib/pdf-text";

const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "reportlab-cv.pdf");

async function imageOnlyPdf() {
  const canvas = createCanvas(480, 240);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 480, 240);
  ctx.fillStyle = "#111111";
  ctx.font = "28px sans-serif";
  ctx.fillText("IMCA Air Diver Scan", 24, 120);
  const png = canvas.toBuffer("image/png");
  const doc = await PDFDocument.create();
  const page = doc.addPage([480, 240]);
  const image = await doc.embedPng(png);
  page.drawImage(image, { x: 0, y: 0, width: 480, height: 240 });
  return Buffer.from(await doc.save());
}

describe("extractPdfText", () => {
  it("reads a ReportLab CV that pdf-parse alone rejects with bad XRef", async () => {
    const bytes = readFileSync(fixture);
    const text = await extractPdfText(bytes);
    assert.match(text, /Alex Holm/);
    assert.match(text, /IMCA Air Diver/);
    assert.match(text, /OEUK Medical/);
  });

  it("joins Chrome Type3 character-per-line dumps", () => {
    const dumped = ["D", "i", "v", "i", "n", "g", "C", "V", "/", "P", "r", "o", "j", "e", "c", "t", "s"].join("\n");
    assert.equal(joinSingleCharacterLines(dumped), "DivingCV/Projects");
  });

  it("renders image-only PDFs that have no extractable text layer", async () => {
    const bytes = await imageOnlyPdf();
    const text = await extractPdfText(bytes);
    assert.equal(text, "");
    const pages = await renderPdfPagesAsImages(bytes, { maxPages: 1, scale: 1 });
    assert.equal(pages.length, 1);
    assert.ok(pages[0]!.length > 500);
    // unpdf renders PNG by default
    assert.equal(pages[0]![0], 0x89);
    assert.equal(pages[0]![1], 0x50);
    assert.equal(pages[0]![2], 0x4e);
    assert.equal(pages[0]![3], 0x47);
  });

  it("reads a Skia seaman-book style CV when the sample is present", async () => {
    const sample = "/tmp/ziggy-original-cv.pdf";
    if (!existsSync(sample)) return;
    const text = await extractPdfText(readFileSync(sample));
    assert.match(text, /Diving\s*CV/i);
    assert.match(text, /Kampfmittel/i);
    assert.match(text, /Offshore/i);
    assert.ok(text.length > 400);
  });
});
