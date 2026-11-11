import { detectKindFromBytes } from "@/lib/document-bytes";
import type { ClientFormKind } from "@/lib/client-forms/types";

const BEACON_CV_TAGS = new Set([
  "EducationLoop",
  "MedicalLoop",
  "CertLoop",
  "WorkExprienceList",
  "MobilizationAirport",
]);

export function detectClientFormKind(bytes: Uint8Array, filename?: string): ClientFormKind {
  const docKind = detectKindFromBytes(bytes) ?? (filename?.toLowerCase().endsWith(".pdf") ? "pdf" : filename?.toLowerCase().endsWith(".docx") ? "docx" : null);
  if (docKind === "pdf") {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 500_000));
    const haystack = text.toLowerCase();
    if (haystack.includes("bolfrm2559") && haystack.includes("pdpa")) {
      return "beacon_pdpa_pdf";
    }
    return "unknown";
  }
  if (docKind === "docx") {
    const haystack = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const tagHits = [...BEACON_CV_TAGS].filter((tag) => haystack.includes(`w:val="${tag}"`));
    if (tagHits.length >= 3) return "beacon_offshore_cv_docx";
    return "unknown";
  }
  return "unknown";
}
