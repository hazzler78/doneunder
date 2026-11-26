import { classifyCertificateFile } from "@/lib/certificate-pack";
import {
  extensionIsMissing,
  mimeForCertificateKind,
  normalizedCertificateName,
  resolveMissingExtensionCertificate,
  unsupportedCertificateTypeMessage,
} from "@/lib/certificate-file-type";
import { isAcceptedMainCvFile } from "@/lib/cv-upload";
import {
  classifyDocumentFile,
  detectKindFromBytes,
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
  const detected = detectKindFromBytes(head, { sniffDocxFromZipHead: true });
  const declared = classifyDocumentFile(file.name, file.type);
  if (!detected || (declared && declared !== detected)) {
    return unsupportedDocumentMessage(file.name, "cv");
  }
  return null;
}

export async function validateCertificateFileOnClient(file: File): Promise<string | null> {
  const prepared = await prepareCertificateFileForUpload(file);
  return "error" in prepared ? prepared.error : null;
}

/**
 * Accept a certificate whose name lost its extension by sniffing the bytes
 * (or a specific browser MIME) and renaming it to the matching extension.
 */
export async function prepareCertificateFileForUpload(
  file: File,
): Promise<{ file: File } | { error: string }> {
  const head = await readFileHead(file);
  if (extensionIsMissing(file.name)) {
    const resolved = resolveMissingExtensionCertificate({
      name: file.name,
      contentType: file.type,
      bytes: head,
      sniffDocxFromZipHead: true,
    });
    if (!resolved.ok) return { error: resolved.error };
    if (resolved.fileName === file.name) return { file };
    return {
      file: new File([file], resolved.fileName, {
        type: resolved.contentType,
        lastModified: file.lastModified,
      }),
    };
  }

  const name = normalizedCertificateName(file.name);
  const kind = classifyCertificateFile(name, file.type);
  if (!kind || kind === "webp") {
    return { error: unsupportedCertificateTypeMessage(file.name) };
  }
  if (kind === "pdf" || kind === "doc" || kind === "docx") {
    const detected = detectKindFromBytes(head, { sniffDocxFromZipHead: true });
    const declared = classifyDocumentFile(name, file.type);
    if (!detected || (declared && declared !== detected)) {
      return { error: unsupportedDocumentMessage(name, "certificate") };
    }
  }
  if (name === file.name) return { file };
  return {
    file: new File([file], name, {
      type: file.type || mimeForCertificateKind(kind),
      lastModified: file.lastModified,
    }),
  };
}
