import { classifyDocumentFile, detectKindFromBytes } from "@/lib/document-bytes";
import { classifyCertificateFile } from "@/lib/certificate-pack";
import { isAcceptedMainCvFile } from "@/lib/cv-upload";
import {
  SUPPORTED_CERTIFICATE_FORMATS_MESSAGE,
  unsupportedDocumentMessage,
} from "@/lib/document-bytes";

async function readFileHead(file: File, bytes = 512) {
  const slice = file.slice(0, bytes);
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function validateCvFileOnClient(file: File): Promise<string | null> {
  if (!isAcceptedMainCvFile(file)) {
    return unsupportedDocumentMessage(file.name, "cv");
  }
  const head = await readFileHead(file);
  const detected = detectKindFromBytes(head);
  const declared = classifyDocumentFile(file.name, file.type);
  if (!detected || (declared && declared !== detected)) {
    return unsupportedDocumentMessage(file.name, "cv");
  }
  return null;
}

export async function validateCertificateFileOnClient(file: File): Promise<string | null> {
  const kind = classifyCertificateFile(file.name, file.type);
  if (!kind || kind === "webp") {
    return `Unsupported certificate format for ${file.name}. ${SUPPORTED_CERTIFICATE_FORMATS_MESSAGE}`;
  }
  if (kind === "pdf" || kind === "doc" || kind === "docx") {
    const head = await readFileHead(file);
    const detected = detectKindFromBytes(head);
    const declared = classifyDocumentFile(file.name, file.type);
    if (!detected || (declared && declared !== detected)) {
      return unsupportedDocumentMessage(file.name, "certificate");
    }
  }
  return null;
}
