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
  return /^main-cv-/i.test(name) || looksLikeMainCvFilename(name);
}
