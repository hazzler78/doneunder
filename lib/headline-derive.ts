import type { DiverCertificationInput, DiverExperienceInput } from "@/lib/diver-profile";
import { sanitizeParsedCertificationName } from "@/lib/cert-text";

const MAX_HEADLINE_LEN = 220;
const MIN_CV_TEXT_FOR_HEADLINE = 150;

function certLabelForHeadline(name: string) {
  const trimmed = name.trim();
  if (!trimmed || /^certification$/i.test(trimmed)) return "";
  const short = trimmed.split(/[,(]/)[0]?.trim() ?? trimmed;
  if (short.length > 72) return `${short.slice(0, 69)}…`;
  return short;
}

function hasUsableCertName(name: string) {
  const label = certLabelForHeadline(name);
  return label.length >= 3;
}

export function profileHasEnoughDataForDerivedHeadline(input: {
  certifications: DiverCertificationInput[];
  experiences: DiverExperienceInput[];
  polishedCvMarkdown?: string | null;
}) {
  const sanitizedCerts = input.certifications
    .map((cert) => sanitizeParsedCertificationName(cert.name, cert.issuing_body, null))
    .filter(hasUsableCertName);
  if (sanitizedCerts.length > 0) return true;
  if (input.experiences.length > 0) return true;
  return (input.polishedCvMarkdown?.trim().length ?? 0) >= MIN_CV_TEXT_FOR_HEADLINE;
}

/**
 * Build a professional headline from tickets and roles already on the profile. Does not invent qualifications.
 */
export function deriveProfessionalHeadline(input: {
  diverFullName?: string | null;
  certifications: DiverCertificationInput[];
  experiences: DiverExperienceInput[];
  polishedCvMarkdown?: string | null;
}): string | null {
  if (!profileHasEnoughDataForDerivedHeadline(input)) return null;

  const parts: string[] = [];
  for (const cert of input.certifications) {
    const name = sanitizeParsedCertificationName(cert.name, cert.issuing_body, input.diverFullName);
    const label = certLabelForHeadline(name);
    if (!label) continue;
    const key = label.toLowerCase();
    if (parts.some((item) => item.toLowerCase() === key)) continue;
    parts.push(label);
    if (parts.length >= 4) break;
  }

  const role = input.experiences[0]?.role_title?.trim();
  if (role && !/^commercial diver$/i.test(role)) {
    const roleKey = role.toLowerCase();
    const alreadyCovered = parts.some(
      (part) => part.toLowerCase().includes(roleKey) || roleKey.includes(part.toLowerCase().slice(0, 12)),
    );
    if (!alreadyCovered) {
      parts.unshift(role);
    }
  }

  if (parts.length === 0) {
    const fallbackRole = input.experiences[0]?.role_title?.trim();
    if (fallbackRole) parts.push(fallbackRole);
  }

  const headline = parts.join(" / ").trim();
  if (!headline) return null;
  return headline.length > MAX_HEADLINE_LEN ? `${headline.slice(0, MAX_HEADLINE_LEN - 1)}…` : headline;
}
