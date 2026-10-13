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

function isMedicalTicket(text: string) {
  return (
    /\b(medical|oeuk|oguk|fitness\s+certificate|diver\s+medical)\b/.test(text) &&
    !/\b(dmt|diver\s*medic\s*technician)\b/.test(text)
  );
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
  if (isMedicalTicket(text) || isSurvivalTicket(text) || isDmtTicket(text)) return false;
  if (/\b(kirby\s*morgan|scuba\s*only|first\s*aid|oxygen|ndt|pcn|cswip)\b/.test(text) && !/\bimca\b/.test(text)) {
    return false;
  }
  if (/\bimca\b/.test(text)) return true;
  const compact = text.replace(/\s+/g, " ");
  return (
    /\bsurface\s*supplied\b/.test(compact) ||
    /\btop\s*[- ]?up\b/.test(compact) ||
    /\bclosed\s*bell\b/.test(compact) ||
    /\bair\s*diving\s*supervisor\b/.test(compact) ||
    /\btrainee\s*air\b/.test(compact) ||
    /\bsat(?:uration)?\s*diver\b/.test(compact) ||
    /\bcommercial\s*(?:air\s*)?diver\b/.test(compact) ||
    /\bhse\s*(?:air|surface)\b/.test(compact) ||
    /\bidsa\s*level\b/.test(compact) ||
    (/\bair\s*diver\b/.test(compact) && !/\bscuba\b/.test(compact))
  );
}

function isMedicalRequirement(required: string) {
  const r = required.toLowerCase();
  return /\b(medical|oeuk|oguk)\b/.test(r);
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

  if (isImcaRequirement(required)) {
    return isImcaDiverTicket(text);
  }
  if (isBosietRequirement(required)) {
    return isSurvivalTicket(text) && /\b(bosiet|foet)\b/.test(text);
  }
  if (isDmtRequirement(required)) {
    return isDmtTicket(text);
  }
  if (isMedicalRequirement(required)) {
    return isMedicalTicket(text);
  }
  if (isNdtRequirement(required)) {
    return /\b(pcn|ndt|cswip|3\.[124]u)\b/.test(text);
  }

  // Avoid medical tickets accidentally matching short diver labels via substring.
  if (isMedicalTicket(text) && isImcaRequirement(required)) return false;

  return literalFallback(required, text);
}

/** @deprecated Prefer ticketSatisfiesRequirement — kept for callers that only have names. */
export function namesMatch(required: string, ticketName: string) {
  return ticketSatisfiesRequirement(required, ticketName);
}
