import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { BeaconPdpaInput, ClientFormFillFailure, ClientFormFillResult } from "@/lib/client-forms/types";

/** Layout tuned for BOLFRM2559 R2 (US Letter). Coordinates are PDF points from bottom-left. */
const LAYOUT = {
  checkConsentX: 72,
  checkDeclineX: 130,
  generalY: 168,
  sensitiveY: 140,
  transferY: 112,
  signatureBox: { x: 95, y: 52, width: 220, height: 36 },
  nameLine: { x: 150, y: 78, size: 10 },
  dateLine: { x: 95, y: 34, size: 10 },
} as const;

export async function fillBeaconPdpaPdf(
  templateBytes: Uint8Array,
  input: BeaconPdpaInput,
): Promise<ClientFormFillResult | ClientFormFillFailure> {
  if (!input.signer_name.trim()) {
    return { ok: false, error: "Signer name is required.", missingFields: ["signer_name"] };
  }
  if (!input.signed_date.trim()) {
    return { ok: false, error: "Signed date is required.", missingFields: ["signed_date"] };
  }

  try {
    const pdf = await PDFDocument.load(templateBytes);
    const page = pdf.getPage(0);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const mark = "X";

    const choices: Array<{ y: number; choice: BeaconPdpaInput["general_personal_data"] }> = [
      { y: LAYOUT.generalY, choice: input.general_personal_data },
      { y: LAYOUT.sensitiveY, choice: input.sensitive_personal_data },
      { y: LAYOUT.transferY, choice: input.transfer_abroad },
    ];

    for (const row of choices) {
      const x = row.choice === "consent" ? LAYOUT.checkConsentX : LAYOUT.checkDeclineX;
      page.drawText(mark, { x, y: row.y, size: 11, font, color: rgb(0, 0, 0) });
    }

    page.drawText(input.signer_name.trim(), {
      x: LAYOUT.nameLine.x,
      y: LAYOUT.nameLine.y,
      size: LAYOUT.nameLine.size,
      font,
    });
    page.drawText(input.signed_date.trim(), {
      x: LAYOUT.dateLine.x,
      y: LAYOUT.dateLine.y,
      size: LAYOUT.dateLine.size,
      font,
    });

    if (input.signature_png?.length) {
      const sig = await pdf.embedPng(input.signature_png);
      const maxW = LAYOUT.signatureBox.width;
      const maxH = LAYOUT.signatureBox.height;
      const scale = Math.min(maxW / sig.width, maxH / sig.height, 1);
      page.drawImage(sig, {
        x: LAYOUT.signatureBox.x,
        y: LAYOUT.signatureBox.y,
        width: sig.width * scale,
        height: sig.height * scale,
      });
    }

    const bytes = await pdf.save();
    const safeName = input.signer_name.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_");
    return {
      ok: true,
      kind: "beacon_pdpa_pdf",
      bytes,
      contentType: "application/pdf",
      filename: `${safeName}_Beacon_PDPA.pdf`,
      missingFields: input.signature_png?.length ? [] : ["signature"],
      consentSnapshot: {
        general_personal_data: input.general_personal_data,
        sensitive_personal_data: input.sensitive_personal_data,
        transfer_abroad: input.transfer_abroad,
        signer_name: input.signer_name,
        signed_date: input.signed_date,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to fill PDPA PDF." };
  }
}

export const BEACON_PDPA_CONSENT_TEXT = `Beacon PDPA consent (BOLFRM2559):
1) General personal data — name, ID/passport, DOB, address, contact, education, work history, email, etc.
2) Sensitive personal data — health, medical exams, fitness tests, offshore survival certificates and related documentation.
3) Transfer abroad — BOL may transfer personal data internationally for hiring, insurance, and fitness assessment.

Hermes must read these three points, ask the diver to choose Consent or Decline for each (never choose for them), then collect printed name, date, and a drawn or uploaded signature before filling the PDF.`;
