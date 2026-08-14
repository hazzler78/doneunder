const CERT_NAME_HINT =
  /\b(cert|certificate|ticket|bosiet|medical|imca|huet|ebs|oguk|hse|ndt|alst|first.?aid)\b/i;

export function looksLikeMainCvFilename(name: string) {
  const lower = name.toLowerCase();
  if (!lower.endsWith(".pdf")) return false;
  const spaced = lower.replace(/[_-]+/g, " ");
  if (CERT_NAME_HINT.test(spaced)) return false;
  return /\b(cv|curriculum|resume|r[eé]sum[eé])\b/.test(spaced);
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
