#!/usr/bin/env node
/**
 * Build tests/fixtures/beacon-cv-template.docx from the real Beacon upload (local path only — never commit source).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const sourcePath =
  process.argv[2] ??
  "/home/ubuntu/.cursor/projects/agent-repos-doneunder/uploads/Gareth_Darrin_MIDDLETON_CV_a4f1.docx";
const outPath = path.join(repoRoot, "tests/fixtures/beacon-cv-template.docx");

function clearSdtText(block) {
  return block.replace(/<w:t(\s[^>]*)?>[\s\S]*?<\/w:t>/g, (match) => {
    const preserve = match.includes('xml:space="preserve"') ? ' xml:space="preserve"' : "";
    return `<w:t${preserve}></w:t>`;
  });
}

function blankProfilePicture(block) {
  return block.replace(/<a:blip[^>]*r:embed="([^"]+)"/g, (m, rid) => m);
}

const bytes = fs.readFileSync(sourcePath);
const zip = await JSZip.loadAsync(bytes);
let xml = await zip.file("word/document.xml").async("string");

const scalarTags = [
  "Full Name",
  "Position",
  "Nationality",
  "DateofBirth",
  "PassportNo",
  "PassportIssueDate",
  "PassportExpiryDate",
  "Passport2No",
  "Passport2IssueDate",
  "Passport2ExpiryDate",
  "SeamanBookNo",
  "SeamanBookIssueDate",
  "SeamanBookExpiryDate",
  "Weight",
  "Height",
  "BloodGroup",
  "MobilizationAirport",
  "HomeAddress",
  "ContactNumber",
  "EmailAddress",
  "ExperienceSummary",
];

for (const tag of scalarTags) {
  const needle = `w:tag w:val="${tag}"`;
  let from = 0;
  while (true) {
    const idx = xml.indexOf(needle, from);
    if (idx < 0) break;
    const sdtStart = xml.lastIndexOf("<w:sdt>", idx);
    const close = "</w:sdt>";
    let depth = 0;
    let i = sdtStart;
    let end = -1;
    while (i < xml.length) {
      const o = xml.indexOf("<w:sdt>", i);
      const c = xml.indexOf(close, i);
      if (c < 0) break;
      if (o >= 0 && o < c) {
        depth += 1;
        i = o + "<w:sdt>".length;
      } else {
        depth -= 1;
        if (depth === 0) {
          end = c;
          break;
        }
        i = c + close.length;
      }
    }
    if (end < 0) break;
    const block = xml.slice(sdtStart, end + close.length);
    const cleared = clearSdtText(block);
    xml = xml.slice(0, sdtStart) + cleared + xml.slice(end + close.length);
    from = sdtStart + cleared.length;
  }
}

void blankProfilePicture;

zip.file("word/document.xml", xml);
const out = await zip.generateAsync({ type: "nodebuffer" });
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out);
console.log(`Wrote sanitized template: ${outPath}`);
