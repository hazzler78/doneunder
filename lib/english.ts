const PLACE_NAMES: Array<[RegExp, string]> = [
  [/\bSverige\b/gi, "Sweden"],
  [/\bGöteborg\b/gi, "Gothenburg"],
  [/\bGoteborg\b/gi, "Gothenburg"],
  [/\bMalmö\b/gi, "Malmo"],
  [/\bLidingö\b/gi, "Lidingo"],
  [/\bGävle\b/gi, "Gavle"],
  [/\bGävleborg\b/gi, "Gavleborg"],
  [/\bÖresund\b/gi, "Oresund"],
  [/\bHelsingborg\b/gi, "Helsingborg"],
  [/\bTrelleborg\b/gi, "Trelleborg"],
];

/** Public-facing English: known place names, then drop Swedish diacritics. */
export function englishPublicText(value: string | null | undefined) {
  if (!value) return "";
  let text = value;
  for (const [pattern, replacement] of PLACE_NAMES) {
    text = text.replace(pattern, replacement);
  }
  return text
    .replace(/[åÅ]/g, (char) => (char === "Å" ? "A" : "a"))
    .replace(/[äÄ]/g, (char) => (char === "Ä" ? "A" : "a"))
    .replace(/[öÖ]/g, (char) => (char === "Ö" ? "O" : "o"));
}

export function englishPublicOrNull(value: string | null | undefined) {
  const text = englishPublicText(value);
  return text || null;
}
