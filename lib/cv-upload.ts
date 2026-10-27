import {
  classifyDocumentFile,
  isWordFileMeta,
  SUPPORTED_CV_FORMATS_MESSAGE,
  type DocumentFileKind,
} from "@/lib/document-bytes";

/** @deprecated Use SUPPORTED_CV_FORMATS_MESSAGE */
export const CV_PDF_ONLY_MESSAGE = SUPPORTED_CV_FORMATS_MESSAGE;

export function isWordCvFile(file: { name: string; type?: string }) {
  return isWordFileMeta(file);
}

export function isAcceptedMainCvFile(file: { name: string; type?: string }) {
  if (isWordCvFile(file)) return true;
  const lower = file.name.toLowerCase();
  return file.type === "application/pdf" || lower.endsWith(".pdf");
}

export function mainCvKindFromFile(file: { name: string; type?: string }): DocumentFileKind | null {
  if (!isAcceptedMainCvFile(file)) return null;
  return classifyDocumentFile(file.name, file.type);
}

export function rejectWordCvFiles(files: { name: string; type?: string }[]) {
  return files.filter((file) => isWordCvFile(file));
}
