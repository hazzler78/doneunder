/**
 * Match campaign/company required tickets to diver certification names.
 * Commercial tickets often omit the literal word "IMCA" (e.g. HSE Surface Supplied Top Up).
 * FOET renews BOSIET. Medical tickets must not satisfy an IMCA diver requirement.
 */

export type TicketMatchInput = {
  name: string;
  issuingBody?: string | null;
};

function haystack(ticket: TicketMatchInput | string) {
  if (typeof ticket === "string") return ticket.toLowerCase();
  return `${ticket.name} ${ticket.issuingBody ?? ""}`.toLowerCase();
}

/** Broad medical-ish label — used to keep medicals out of IMCA matching, not to satisfy HSE/G31. */
function isMedicalishTicket(text: string) {
  return (
    /\b(medical|oeuk|oguk|fitness\s+certificate|offshore\s+diver\s+medical|diver\s+medical)\b/.test(text) &&
    !/\b(dmt|diver\s*medic\s*technician)\b/.test(text)
  );
}

function isHseUkDivingMedicalTicket(text: string) {
  if (/\b(dmt|diver\s*medic\s*technician)\b/.test(text)) return false;
  if (/\b(g31|tauchtauglichkeit|tauglichkeitsuntersuchung)\b/.test(text)) return false;
  if (/\b(hse|imca)\b.*\b(diver\s*)?medical\b/.test(text)) return true;
  if (/\boffshore\s+diver\s+medical\b/.test(text)) return true;
  if (/\b(oeuk|oguk)\b/.test(text)) return true;
  if (/\b(uk|offshore)\b.*\b(medical|fitness\s+certificate)\b/.test(text)) return true;
  if (/\b(diver\s+medical|diving\s+medical)\b/.test(text) && /\b(hse|imca|uk|offshore|north\s*sea)\b/.test(text)) {
    return true;
  }
  return false;
}

function isG31TauchtauglichkeitTicket(text: string) {
  if (/\b(g\s*31|g-31)\b/.test(text)) return true;
  if (/\btauchtauglichkeit\b/.test(text)) return true;
  if (/\btauglichkeitsuntersuchung\b/.test(text)) return true;
  if (/\b(tauchtauglich|tauglichkeit)\b/.test(text) && /\b(tauch|diving|taucher)\b/.test(text)) return true;
  return false;
}

function isGermanTauchtauglichRequirement(required: string) {
  const r = required.toLowerCase();
  return /\bg\s*31\b/.test(r) || /\btauchtauglich/.test(r);
}

function isIhkGepruefterTaucherTicket(text: string) {
  if (isMedicalishTicket(text) && !isIhkGepruefterTaucherTicketExplicit(text)) return false;
  return isIhkGepruefterTaucherTicketExplicit(text) || isImcaDiverTicket(text);
}

function isIhkGepruefterTaucherTicketExplicit(text: string) {
  if (/\bgepr[üu]ft(er|e|en)?\s*taucher\b/.test(text)) return true;
  if (/\bihk\b/.test(text) && /\btaucher\b/.test(text)) return true;
  if (/\bfosa\b/.test(text) && /\b(taucher|diving)\b/.test(text)) return true;
  return false;
}

function isIhkTaucherRequirement(required: string) {
  const r = required.toLowerCase();
  return /\bihk\b/.test(r) || /\bgepr[üu]ft/.test(r) || (r.includes("taucher") && r.includes("equivalent"));
}

/** True when a ticket looks medical but does not confidently satisfy a strict diving-medical requirement. */
export function ticketNeedsMedicalReview(required: string, ticket: TicketMatchInput | string): boolean {
  const text = haystack(ticket);
  if (!text.trim()) return false;
  if (isGermanTauchtauglichRequirement(required)) {
    return isMedicalishTicket(text) && !isG31TauchtauglichkeitTicket(text);
  }
  if (isHseMedicalRequirement(required)) {
    return isMedicalishTicket(text) && !isHseUkDivingMedicalTicket(text);
  }
  return false;
}

/** @deprecated Prefer isMedicalishTicket — kept for tests importing the old name. */
export function isMedicalTicket(text: string) {
  return isMedicalishTicket(text);
}

/** A row that is only the campaign label, with no body and no date, is not a held ticket. */
export function isPlaceholderCertificate(ticket: {
  name: string;
  issuingBody?: string | null;
  expiryDate?: string | null;
}) {
  const name = ticket.name.trim().toLowerCase();
  const labels = new Set([
    "imca",
    "imca diver",
    "hse diver medical",
    "medical",
    "bosiet",
    "certification",
    "not provided",
  ]);
  return labels.has(name) && !ticket.issuingBody?.trim() && !ticket.expiryDate?.trim();
}

function isSurvivalTicket(text: string) {
  return /\b(bosiet|foet|huet|ca-?ebs|escape\s*chute)\b/.test(text);
}

function isDmtTicket(text: string) {
  // Word-boundary after "medic" avoids matching "diver medical" fitness certificates.
  return (
    /\bdmt\b/i.test(text) ||
    /\bdiver\s*medic(?:al)?\s*technician\b/i.test(text) ||
    /\bdiver\s*medics?\b/i.test(text)
  );
}

/** Commercial diving competence tickets that satisfy an IMCA-style requirement. */
function isImcaDiverTicket(text: string) {
  if (isMedicalishTicket(text) || isSurvivalTicket(text) || isDmtTicket(text)) return false;
  if (/\b(kirby\s*morgan|scuba\s*only|first\s*aid|oxygen|ndt|pcn|cswip)\b/.test(text) && !/\bimca\b/.test(text)) {
    return false;
  }
  if (/\bimca\b/.test(text)) return true;
  const compact = text.replace(/\s+/g, " ");
  // Job titles such as "Commercial Diver" or "Air Diver" are not an IMCA ticket.
  return (
    /\bsurface\s*supplied\b/.test(compact) ||
    /\btop\s*[- ]?up\b/.test(compact) ||
    /\bclosed\s*bell\b/.test(compact) ||
    /\bair\s*diving\s*supervisor\b/.test(compact) ||
    /\btrainee\s*air\b/.test(compact) ||
    /\bhse\s*(?:air|surface)\b/.test(compact) ||
    /\bidsa\s*level\b/.test(compact)
  );
}

function isHseMedicalRequirement(required: string) {
  const r = required.toLowerCase();
  if (isGermanTauchtauglichRequirement(required)) return false;
  return (
    /\bhse\b.*\bmedical\b/.test(r) ||
    /\b(oeuk|oguk)\b/.test(r) ||
    (/\bmedical\b/.test(r) && /\b(diver|offshore|diving)\b/.test(r))
  );
}

function isLegacyMedicalRequirement(required: string) {
  const r = required.toLowerCase();
  return /\b(medical|oeuk|oguk)\b/.test(r) && !isGermanTauchtauglichRequirement(required);
}

function isBosietRequirement(required: string) {
  const r = required.toLowerCase();
  return /\b(bosiet|foet)\b/.test(r);
}

function isDmtRequirement(required: string) {
  return (
    /\bdmt\b/i.test(required) ||
    /\bdiver\s*medic(?:al)?\s*technician\b/i.test(required) ||
    /\bdiver\s*medics?\b/i.test(required)
  );
}

function isImcaRequirement(required: string) {
  const r = required.toLowerCase();
  return r === "imca" || /\bimca\b/.test(r);
}

function isNdtRequirement(required: string) {
  return /\b(pcn|ndt|cswip)\b/i.test(required);
}

function literalFallback(required: string, text: string) {
  const needle = required.toLowerCase().trim();
  if (!needle) return false;
  if (text.includes(needle) || needle.includes(text.trim())) return true;
  const tokens = needle.split(/[^a-z0-9]+/).filter((token) => token.length >= 3);
  return tokens.length > 0 && tokens.every((token) => text.includes(token));
}

/** True when a stored ticket satisfies a required campaign/company ticket label. */
export function ticketSatisfiesRequirement(
  required: string,
  ticket: TicketMatchInput | string,
): boolean {
  const text = haystack(ticket);
  if (!text.trim()) return false;

  if (isIhkTaucherRequirement(required)) {
    return isIhkGepruefterTaucherTicket(text);
  }
  if (isGermanTauchtauglichRequirement(required)) {
    return isG31TauchtauglichkeitTicket(text);
  }
  if (isImcaRequirement(required)) {
    return isImcaDiverTicket(text);
  }
  if (isBosietRequirement(required)) {
    return isSurvivalTicket(text) && /\b(bosiet|foet)\b/.test(text);
  }
  if (isDmtRequirement(required)) {
    return isDmtTicket(text);
  }
  if (isHseMedicalRequirement(required) || isLegacyMedicalRequirement(required)) {
    return isHseUkDivingMedicalTicket(text);
  }
  if (isNdtRequirement(required)) {
    return /\b(pcn|ndt|cswip|3\.[124]u)\b/.test(text);
  }

  // Avoid medical tickets accidentally matching short diver labels via substring.
  if (isMedicalishTicket(text) && isImcaRequirement(required)) return false;

  return literalFallback(required, text);
}

/** @deprecated Prefer ticketSatisfiesRequirement — kept for callers that only have names. */
export function namesMatch(required: string, ticketName: string) {
  return ticketSatisfiesRequirement(required, ticketName);
}