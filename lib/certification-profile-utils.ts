import type { DiverCertificationInput } from "@/lib/diver-profile";

function includesLoose(haystack: string, needle: string) {
  const left = haystack.trim().toLowerCase();
  const right = needle.trim().toLowerCase();
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

export function certificationDocumentSourceRef(storagePath: string) {
  return `file:${storagePath}`;
}

export function storagePathsFromCertificationSourceRef(sourceRef?: string | null) {
  if (!sourceRef?.startsWith("file:")) return [];
  const path = sourceRef.slice("file:".length).trim();
  return path ? [path] : [];
}

/** Spread a cert patch without wiping stored fields with undefined or blank strings. */
export function mergeDefinedCertificationPatch(
  existing: DiverCertificationInput,
  patch: Partial<DiverCertificationInput>,
): DiverCertificationInput {
  const merged = { ...existing };
  if (patch.name !== undefined && patch.name.trim() !== "") merged.name = patch.name.trim();
  if (patch.issue_date !== undefined && patch.issue_date.trim() !== "") merged.issue_date = patch.issue_date;
  if (patch.expiry_date !== undefined && patch.expiry_date.trim() !== "") merged.expiry_date = patch.expiry_date;
  if (patch.cert_number !== undefined && patch.cert_number.trim() !== "") {
    merged.cert_number = patch.cert_number.trim();
  }
  if (patch.issuing_body !== undefined && patch.issuing_body.trim() !== "") {
    merged.issuing_body = patch.issuing_body.trim();
  }
  if (patch.source_ref !== undefined && patch.source_ref.trim() !== "") merged.source_ref = patch.source_ref;
  if (patch.expiry_confirmed !== undefined) merged.expiry_confirmed = patch.expiry_confirmed;
  if (patch.source !== undefined) merged.source = patch.source;
  if (patch.id !== undefined) merged.id = patch.id;
  return merged;
}

function exactNameMatches(items: DiverCertificationInput[], name: string) {
  const normalized = name.trim().toLowerCase();
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.name.trim().toLowerCase() === normalized)
    .map(({ index }) => index);
}

export type CertificationMatchInput = {
  id?: string;
  name?: string;
  cert_number?: string;
};

/**
 * Resolve which certification row(s) a match refers to.
 * Returns exactly one index, zero with error, or ambiguous with error.
 */
export function resolveCertificationMatchIndexes(
  items: DiverCertificationInput[],
  match: CertificationMatchInput,
): { indexes: number[]; error?: string } {
  if (match.id) {
    const index = items.findIndex((item) => item.id === match.id);
    if (index < 0) {
      return { indexes: [], error: `Could not find certification (id=${match.id}).` };
    }
    return { indexes: [index] };
  }

  if (match.cert_number) {
    const normalized = match.cert_number.trim().toLowerCase();
    const indexes = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => (item.cert_number ?? "").trim().toLowerCase() === normalized)
      .map(({ index }) => index);
    if (indexes.length === 0) {
      return { indexes: [], error: `Could not find certification (cert_number=${match.cert_number}).` };
    }
    if (indexes.length > 1) {
      return {
        indexes: [],
        error: `Multiple certifications share cert_number=${match.cert_number}; match by id instead.`,
      };
    }
    return { indexes };
  }

  if (match.name) {
    const exact = exactNameMatches(items, match.name);
    if (exact.length === 1) return { indexes: exact };
    if (exact.length > 1) {
      return {
        indexes: [],
        error: `Multiple certifications named "${match.name}"; ask which one or match by id.`,
      };
    }

    const loose = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => includesLoose(item.name, match.name!))
      .map(({ index }) => index);
    if (loose.length === 1) return { indexes: loose };
    if (loose.length > 1) {
      return {
        indexes: [],
        error: `Multiple certifications match "${match.name}"; use id or an exact title.`,
      };
    }
    return { indexes: [], error: `Could not find certification (name=${match.name}).` };
  }

  return { indexes: [], error: "Provide a certification id, cert_number, or name to match." };
}

export function findCertificationIndexBySourceFile(items: DiverCertificationInput[], storagePath: string) {
  const ref = certificationDocumentSourceRef(storagePath);
  return items.findIndex((item) => item.source_ref === ref);
}
