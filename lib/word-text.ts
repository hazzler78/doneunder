import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import {
  detectKindFromBytes,
  LEGACY_DOC_NO_TEXT_MESSAGE,
  type DocumentFileKind,
} from "@/lib/document-bytes";

function cleanExtractedText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

export type WordTextExtraction = {
  text: string;
  kind: DocumentFileKind | null;
  legacyDocNoText: boolean;
  warning?: string;
};

export async function extractTextFromWordBytes(
  bytes: Buffer,
  fileName: string,
): Promise<WordTextExtraction> {
  const kind = detectKindFromBytes(bytes) ?? (/\.docx$/i.test(fileName) ? "docx" : "doc");
  if (kind === "docx") {
    try {
      const result = await mammoth.extractRawText({ buffer: bytes });
      const text = cleanExtractedText(result.value ?? "");
      if (text) {
        return { text, kind, legacyDocNoText: false };
      }
    } catch {
      // Fall through to word-extractor.
    }
  }

  try {
    const extractor = new WordExtractor();
    const document = await extractor.extract(bytes);
    const body = cleanExtractedText(document.getBody() ?? "");
    if (body) {
      return { text: body, kind, legacyDocNoText: false };
    }
  } catch {
    // handled below
  }

  if (kind === "doc") {
    return {
      text: "",
      kind,
      legacyDocNoText: true,
      warning: LEGACY_DOC_NO_TEXT_MESSAGE,
    };
  }

  return { text: "", kind, legacyDocNoText: false };
}
