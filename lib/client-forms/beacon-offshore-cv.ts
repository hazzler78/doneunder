import JSZip from "jszip";
import {
  extractRepeatingSectionItemTemplate,
  fillTagsInFragment,
  replaceRepeatingSection,
  setContentControlText,
} from "@/lib/client-forms/docx-content-controls";
import { buildBeaconCvFieldMap } from "@/lib/client-forms/assemble-diver-record";
import type { ClientFormFillFailure, ClientFormFillResult, DiverFormSource } from "@/lib/client-forms/types";

export async function fillBeaconOffshoreCvDocx(
  templateBytes: Uint8Array,
  source: DiverFormSource,
): Promise<ClientFormFillResult | ClientFormFillFailure> {
  try {
    const zip = await JSZip.loadAsync(templateBytes);
    const docFile = zip.file("word/document.xml");
    if (!docFile) return { ok: false, error: "Invalid DOCX — missing word/document.xml." };

    let xml = await docFile.async("string");
    const map = buildBeaconCvFieldMap(source);

    for (const [tag, value] of Object.entries(map.scalar)) {
      xml = setContentControlText(xml, tag, value);
    }

    const eduProto = extractRepeatingSectionItemTemplate(xml, "EducationLoop");
    if (eduProto) {
      const rows = map.education.map((row) => fillTagsInFragment(eduProto, row));
      xml = replaceRepeatingSection(xml, "EducationLoop", rows);
    }

    const medProto = extractRepeatingSectionItemTemplate(xml, "MedicalLoop");
    if (medProto) {
      const rows = map.medical.map((row) => fillTagsInFragment(medProto, row));
      xml = replaceRepeatingSection(xml, "MedicalLoop", rows);
    }

    const certProto = extractRepeatingSectionItemTemplate(xml, "CertLoop");
    if (certProto) {
      const rows = map.certs.map((row) => fillTagsInFragment(certProto, row));
      xml = replaceRepeatingSection(xml, "CertLoop", rows);
    }

    const workProto = extractRepeatingSectionItemTemplate(xml, "WorkExprienceList");
    if (workProto) {
      const rows = map.work.map((row) => fillTagsInFragment(workProto, row));
      xml = replaceRepeatingSection(xml, "WorkExprienceList", rows);
    }

    if (source.profilePictureBytes?.length) {
      const mediaPath = Object.keys(zip.files).find((p) => p.startsWith("word/media/image") && p.endsWith(".png"));
      if (mediaPath) {
        zip.file(mediaPath, source.profilePictureBytes);
      }
    }

    zip.file("word/document.xml", xml);
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

    const safeName = source.displayName.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_");
    return {
      ok: true,
      kind: "beacon_offshore_cv_docx",
      bytes,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: `${safeName}_Beacon_CV.docx`,
      missingFields: map.missing,
      previewNotes: map.missing.length
        ? ["Some profile fields were empty — Hermes should ask the diver before sending."]
        : undefined,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to fill Beacon CV template." };
  }
}
