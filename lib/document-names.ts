const CERT_NAME_HINT =
  /\b(cert|certificate|ticket|bosiet|medical|imca|huet|ebs|oguk|oeuk|hse|ndt|alst|first.?aid)\b/i;
const CV_NAME_HINT = /\b(cv|curriculum|resume|r[eé]sum[eé])\b/;

function spacedFilename(name: string) {
  return name.toLowerCase().replace(/[_-]+/g, " ");
}

export function looksLikeCertificateFilename(name: string) {
  return CERT_NAME_HINT.test(spacedFilename(name));
}

export function looksLikeMainCvFilename(name: string) {
  const lower = name.toLowerCase();
  if (!lower.endsWith(".pdf")) return false;
  const spaced = spacedFilename(name);
  if (looksLikeCertificateFilename(name) && !CV_NAME_HINT.test(spaced)) return false;
  return CV_NAME_HINT.test(spaced);
}

/** First CV-named PDF, else the only PDF that is not a ticket scan. */
export function pickMainCvFile<T extends { name: string }>(files: T[]): T | null {
  const named = files.find((file) => looksLikeMainCvFilename(file.name));
  if (named) return named;
  const pdfs = files.filter((file) => file.name.toLowerCase().endsWith(".pdf"));
  const notTickets = pdfs.filter((file) => !looksLikeCertificateFilename(file.name));
  return notTickets.length === 1 ? notTickets[0]! : null;
}

export function isStoredMainCvFilename(name: string) {
  return /^main-cv-/i.test(name) || name === "original-cv.pdf" || looksLikeMainCvFilename(name);
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
