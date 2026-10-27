const CERT_NAME_HINT =
  /\b(certs?|certificate|ticket|bosiet|medical|imca|huet|ebs|oguk|oeuk|hse|ndt|alst|first.?aid|dmt|cda|pt\d+)\b/i;
const CV_NAME_HINT =
  /\b(cv|curriculum|resume|r[eé]sum[eé]|seaman|seamansbook|cdc|logbook)\b/i;

function spacedFilename(name: string) {
  return name.toLowerCase().replace(/[_-]+/g, " ");
}

export function looksLikeCertificateFilename(name: string) {
  return CERT_NAME_HINT.test(spacedFilename(name));
}

function isCvDocumentExtension(name: string) {
  return /\.(pdf|docx?)$/i.test(name.toLowerCase());
}

export function looksLikeMainCvFilename(name: string) {
  if (!isCvDocumentExtension(name)) return false;
  const spaced = spacedFilename(name);
  if (looksLikeCertificateFilename(name) && !CV_NAME_HINT.test(spaced)) return false;
  return CV_NAME_HINT.test(spaced);
}

/** Picks a PDF only when the filename clearly indicates a CV/resume (not from a lone ambiguous PDF). */
export function pickMainCvFile<T extends { name: string }>(files: T[]): T | null {
  return files.find((file) => looksLikeMainCvFilename(file.name)) ?? null;
}

/**
 * Chat attachments: never replace an existing stored CV unless the filename clearly names a CV.
 * Panel uploads pass an explicit CV file via the CV control instead.
 */
export function pickMainCvFromChatAttachment<T extends { name: string }>(
  files: T[],
  options: { hasStoredCv: boolean },
): T | null {
  const candidate = pickMainCvFile(files);
  if (!candidate) return null;
  if (options.hasStoredCv && !looksLikeMainCvFilename(candidate.name)) return null;
  return candidate;
}

export function isStoredMainCvFilename(name: string) {
  return (
    /^main-cv-/i.test(name) ||
    /^original-cv\.(pdf|docx?)$/i.test(name) ||
    looksLikeMainCvFilename(name)
  );
}

export function certificateSlug(name: string) {
  const withoutExt = name.toLowerCase().replace(/\.[a-z0-9]+$/, "");
  const slug = withoutExt
    .replace(/[_]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "certificate";
}

export function isGenericCertificateSlug(slug: string) {
  return /^(img|image|photo|scan|dsc|pic|cert|certificate)(-[a-z0-9]+)?$/.test(slug) || /^[a-f0-9-]{16,}$/.test(slug);
}

export function displayCertificateName(name: string) {
  return name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/^photo-[a-f0-9]+$/i, "Certificate photo")
    .replace(/^cert-[a-f0-9-]+$/i, "Certificate scan")
    .replace(/[-_]+/g, " ")
    .trim();
}
