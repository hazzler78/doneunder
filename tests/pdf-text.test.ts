import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { extractPdfText } from "../lib/pdf-text";

const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "reportlab-cv.pdf");

describe("extractPdfText", () => {
  it("reads a ReportLab CV that pdf-parse alone rejects with bad XRef", async () => {
    const bytes = readFileSync(fixture);
    const text = await extractPdfText(bytes);
    assert.match(text, /Alex Holm/);
    assert.match(text, /IMCA Air Diver/);
    assert.match(text, /OEUK Medical/);
  });
});
