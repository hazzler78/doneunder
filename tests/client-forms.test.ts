import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { extractTextFromWordBytes } from "../lib/word-text";
import { extractPdfText } from "../lib/pdf-text";
import { detectClientFormKind } from "../lib/client-forms/detect";
import { fillBeaconOffshoreCvDocx } from "../lib/client-forms/beacon-offshore-cv";
import { fillBeaconPdpaPdf } from "../lib/client-forms/beacon-pdpa-pdf";
import { emptyDiverProfileScalars, type DiverProfileFull } from "../lib/diver-profile";
import type { DiverOnboardingBundle } from "../lib/diver-private-details";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, "fixtures");
const artifactsDir = "/opt/cursor/artifacts";

function syntheticProfile(): DiverProfileFull {
  return {
    profile: {
      ...emptyDiverProfileScalars(),
      headline: "Saturation Diver",
      bio: "Offshore saturation diver with 1800+ sat hours on DP vessels.",
      location: "Aberdeen",
      phone: "+44 7700 900456",
    },
    experiences: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        company: "NorthSea Marine Ltd",
        project_name: "Thistle PDQ",
        location: "UKCS",
        role_title: "Diver Technician",
        date_start: "2024-01",
        date_end: "2024-06",
        summary: "Routine inspection and corrective maintenance.",
        client_name: "Operator Alpha",
        rig_vessel_name: "MV Northern Star",
        work_scope: "Inspection and minor repair",
        scope_system: "Subsea structures",
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        company: "BlueOcean Contractors",
        project_name: null,
        location: "Thailand",
        role_title: "Bell Diver",
        date_start: "2023-03",
        date_end: "2023-11",
        summary: "Saturation diving support.",
        client_name: "Beacon Offshore",
        rig_vessel_name: "CSV Horizon",
        work_scope: "Saturation diving",
        scope_system: "DP vessel spread",
      },
    ],
    certifications: [
      {
        id: "00000000-0000-4000-8000-000000000010",
        name: "HSE Diver Medical (UK)",
        issue_date: "2024-02-01",
        expiry_date: "2025-02-01",
        cert_number: "MED-445566",
        issuing_body: "HSE",
        expiry_confirmed: true,
      },
      {
        id: "00000000-0000-4000-8000-000000000011",
        name: "BOSIET with CA-EBS",
        issue_date: "2023-06-01",
        expiry_date: "2027-06-01",
        cert_number: "BOS-88991",
        issuing_body: "OPITO",
        expiry_confirmed: true,
      },
    ],
    references: [],
  };
}

function syntheticBundle(): DiverOnboardingBundle {
  return {
    privateDetails: {
      user_id: "00000000-0000-4000-8000-000000000099",
      nationality: "British",
      date_of_birth: "1988-04-12",
      home_address: "12 Harbour Walk, Aberdeen AB11 5QP",
      mobilization_airport: "ABZ",
      height_cm: 182,
      weight_kg: 88,
      blood_group: "O+",
      seaman_book: { number: "SB-123456", issue_date: "2020-01-01", expiry_date: "2030-01-01" },
      passports: [
        { number: "999888777", issue_date: "2019-05-01", expiry_date: "2029-05-01" },
        { number: "555444333", issue_date: "2021-03-01", expiry_date: "2031-03-01" },
      ],
      signature_storage_path: null,
      sensitive_data_consent_at: new Date().toISOString(),
    },
    education: [
      { id: "1", degree: "HND Commercial Diving", institute: "The Underwater Centre", year_completed: "2010", sort_order: 0 },
    ],
  };
}

describe("client form filling", () => {
  it("detects Beacon CV DOCX and PDPA PDF", () => {
    const docx = fs.readFileSync(path.join(fixtures, "beacon-cv-template.docx"));
    const pdf = fs.readFileSync(path.join(fixtures, "beacon-pdpa-template.pdf"));
    assert.equal(detectClientFormKind(docx), "beacon_offshore_cv_docx");
    assert.equal(detectClientFormKind(pdf), "beacon_pdpa_pdf");
  });

  it("fills sanitized Beacon CV template including repeating sections", async () => {
    const template = new Uint8Array(fs.readFileSync(path.join(fixtures, "beacon-cv-template.docx")));
    const result = await fillBeaconOffshoreCvDocx(template, {
      displayName: "Alex River",
      email: "alex.river@example.com",
      positionTitle: "Saturation Diver",
      profile: syntheticProfile(),
      bundle: syntheticBundle(),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(path.join(artifactsDir, "beacon-cv-filled-synthetic.docx"), result.bytes);

    const extracted = await extractTextFromWordBytes(Buffer.from(result.bytes), "filled.docx");
    const text = extracted.text;
    const normalized = text.replace(/\s+/g, " ");
    assert.match(normalized, /Alex River/);
    assert.match(normalized, /British/);
    assert.match(normalized, /NorthSea Marine/);
    assert.match(normalized, /BlueOcean Contractors/);
    assert.match(normalized, /HND Commercial Diving/);
    assert.match(normalized, /BOSIET/);
    assert.match(normalized, /HSE Diver Medical/);
  });

  it("fills Beacon PDPA PDF with explicit consent choices", async () => {
    const template = new Uint8Array(fs.readFileSync(path.join(fixtures, "beacon-pdpa-template.pdf")));
    const { createCanvas } = await import("@napi-rs/canvas");
    const canvas = createCanvas(240, 60);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 240, 60);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, 40);
    ctx.quadraticCurveTo(80, 10, 200, 35);
    ctx.stroke();
    const signaturePng = canvas.toBuffer("image/png");

    const result = await fillBeaconPdpaPdf(template, {
      general_personal_data: "consent",
      sensitive_personal_data: "consent",
      transfer_abroad: "decline",
      signer_name: "Alex River",
      signed_date: "11/11/2026",
      signature_png: new Uint8Array(signaturePng),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    fs.writeFileSync(path.join(artifactsDir, "beacon-pdpa-filled-synthetic.pdf"), result.bytes);
    const text = await extractPdfText(result.bytes);
  assert.match(text.replace(/\s+/g, " "), /Alex River/);
  });
});
