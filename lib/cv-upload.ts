/** Main CV uploads are PDF-only on Vercel serverless (no reliable Word extraction in this runtime). */
export const CV_PDF_ONLY_MESSAGE =
  "Please upload your CV as a PDF. In Microsoft Word use File → Save As → PDF, then upload that file.";

const WORD_CV_PATTERN = /\.(doc|docx)$/i;

const WORD_CV_MIME =
  /^(application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/i;

export function isWordCvFile(file: { name: string; type?: string }) {
  const name = file.name.toLowerCase();
  if (WORD_CV_PATTERN.test(name)) return true;
  const type = file.type?.trim() ?? "";
  return type ? WORD_CV_MIME.test(type) : false;
}

export function isAcceptedMainCvFile(file: { name: string; type?: string }) {
  if (isWordCvFile(file)) return false;
  const lower = file.name.toLowerCase();
  return file.type === "application/pdf" || lower.endsWith(".pdf");
}

export function rejectWordCvFiles(files: { name: string; type?: string }[]) {
  return files.filter((file) => isWordCvFile(file));
}
