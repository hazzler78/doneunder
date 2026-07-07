import { randomUUID } from "node:crypto";
import { generateObject } from "ai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { createWorker } from "tesseract.js";
import { z } from "zod";
import { AI_DISCLAIMER, aiModel } from "@/lib/ai";
import { getAuthenticatedDiverContext } from "@/lib/diver-auth";
import { aiCvOutputSchema } from "@/lib/diver-profile";
import { aiCvOutputToPayload, saveDiverProfile } from "@/lib/diver-profile-service";

const BUCKET_NAME = "diver-documents";
const MAX_MAIN_CV_MB = 12;
const MAX_CERT_MB = 8;
const MAX_CERT_FILES = 10;
const MAX_SOURCE_TEXT_CHARS = 60000;
const CHUNK_SIZE = 6000;
const CHUNK_OVERLAP = 400;
const IS_VERCEL_RUNTIME = Boolean(process.env.VERCEL);

const cvSystemPrompt = `You are a specialist commercial diving CV and profile writer for doneunder.ai.
Turn raw CVs and certification documents into a polished, accurate profile for offshore recruiters.
Return factual outputs only from provided material. Use "Not provided" when unknown.
Prioritize complete experience extraction: include all identifiable roles/projects from the source text, ordered most recent first.
Respond in the exact JSON schema requested.`;

const cvChunkSchema = z.object({
  summary: z.string().min(1),
  certifications_mentioned: z.array(z.string()).default([]),
  experiences_mentioned: z.array(z.string()).default([]),
  contacts_mentioned: z.array(z.string()).default([]),
});

function cleanText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function truncateText(input: string, maxChars = MAX_SOURCE_TEXT_CHARS) {
  return input.length > maxChars ? input.slice(0, maxChars) : input;
}

function splitTextIntoChunks(input: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks: string[] = [];
  if (!input) return chunks;
  let start = 0;
  while (start < input.length) {
    const end = Math.min(start + size, input.length);
    chunks.push(input.slice(start, end));
    if (end >= input.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks.slice(0, 8);
}

async function extractPdfText(buffer: Buffer) {
  const parsed = await pdfParse(buffer);
  return cleanText(parsed.text || "");
}

async function extractImageText(buffer: Buffer) {
  if (IS_VERCEL_RUNTIME) {
    // Tesseract workers are fragile in serverless runtimes; skip OCR rather than failing the entire flow.
    return "";
  }
  const worker = await createWorker("eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    return cleanText(text || "");
  } catch {
    return "";
  } finally {
    await worker.terminate();
  }
}

function ensureEnv() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase environment is not configured.");
  }
}

function bytesToMb(size: number) {
  return Number((size / (1024 * 1024)).toFixed(2));
}

function validateFile(file: File, maxMb: number) {
  if (file.size === 0) throw new Error(`${file.name} is empty.`);
  if (bytesToMb(file.size) > maxMb) throw new Error(`${file.name} exceeds ${maxMb}MB.`);
}

export async function POST(req: Request) {
  try {
    ensureEnv();
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const formData = await req.formData();
    const mainCvFile = formData.get("mainCv");
    const certFiles = formData.getAll("certificates");

    if (!(mainCvFile instanceof File)) {
      return NextResponse.json({ error: "Main CV PDF is required." }, { status: 400 });
    }
    if (mainCvFile.type !== "application/pdf") {
      return NextResponse.json({ error: "Main CV must be a PDF." }, { status: 400 });
    }

    const certificateFiles = certFiles.filter((entry): entry is File => entry instanceof File);
    if (certificateFiles.length > MAX_CERT_FILES) {
      return NextResponse.json({ error: `Maximum ${MAX_CERT_FILES} certificate files allowed.` }, { status: 400 });
    }

    validateFile(mainCvFile, MAX_MAIN_CV_MB);
    for (const certFile of certificateFiles) {
      const validType = certFile.type === "application/pdf" || certFile.type === "image/jpeg" || certFile.type === "image/png";
      if (!validType) {
        return NextResponse.json(
          { error: `Unsupported certificate format for ${certFile.name}. Use PDF, JPG, or PNG.` },
          { status: 400 },
        );
      }
      validateFile(certFile, MAX_CERT_MB);
    }

    const serviceSupabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const importBatchId = randomUUID();
    const userFolder = `${authResult.diverId}/${importBatchId}`;
    const diverId = authResult.diverId;

    const cvBuffer = Buffer.from(await mainCvFile.arrayBuffer());
    const cvPath = `${userFolder}/main-cv-${Date.now()}.pdf`;
    const cvUpload = await serviceSupabase.storage.from(BUCKET_NAME).upload(cvPath, cvBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (cvUpload.error) {
      return NextResponse.json({ error: `Failed to upload CV: ${cvUpload.error.message}` }, { status: 400 });
    }

    const certUploadResults: { path: string; mimeType: string; name: string; dataUrl: string }[] = [];
    const certExtractedTextParts: string[] = [];
    const extractionWarnings: string[] = [];
    for (const certFile of certificateFiles) {
      const certBuffer = Buffer.from(await certFile.arrayBuffer());
      const extension = certFile.type === "application/pdf" ? "pdf" : certFile.type === "image/png" ? "png" : "jpg";
      const certPath = `${userFolder}/cert-${randomUUID()}.${extension}`;
      const uploadResult = await serviceSupabase.storage.from(BUCKET_NAME).upload(certPath, certBuffer, {
        contentType: certFile.type,
        upsert: false,
      });
      if (uploadResult.error) {
        return NextResponse.json({ error: `Failed to upload ${certFile.name}: ${uploadResult.error.message}` }, { status: 400 });
      }
      certUploadResults.push({
        path: certPath,
        mimeType: certFile.type,
        name: certFile.name,
        dataUrl: "",
      });

      if (certFile.type === "application/pdf") {
        try {
          const extracted = await extractPdfText(certBuffer);
          if (extracted) certExtractedTextParts.push(`[${certFile.name}] ${truncateText(extracted, 12000)}`);
        } catch {
          extractionWarnings.push(`Could not parse certificate PDF text for ${certFile.name}.`);
        }
      } else {
        const extracted = await extractImageText(certBuffer);
        if (extracted) certExtractedTextParts.push(`[${certFile.name}] ${truncateText(extracted, 6000)}`);
        if (!extracted) {
          extractionWarnings.push(
            `Image OCR for ${certFile.name} was skipped in this runtime. Profile extraction continues from CV/PDF text.`,
          );
        }
      }
    }

    const cvText = truncateText(await extractPdfText(cvBuffer));
    const cvChunks = splitTextIntoChunks(cvText);
    const chunkSummaries: string[] = [];
    const chunkCertMentions: string[] = [];
    const chunkExperienceMentions: string[] = [];
    const chunkContactMentions: string[] = [];

    for (const [index, chunk] of cvChunks.entries()) {
      const chunkResult = await generateObject({
        model: aiModel,
        schema: cvChunkSchema,
        system:
          "You extract normalized, factual profile data from commercial diving CV fragments. Return concise output and no hallucinations.",
        prompt: `Chunk ${index + 1}/${cvChunks.length} from CV "${mainCvFile.name}":\n${chunk}`,
      });
      chunkSummaries.push(chunkResult.object.summary);
      chunkCertMentions.push(...chunkResult.object.certifications_mentioned);
      chunkExperienceMentions.push(...chunkResult.object.experiences_mentioned);
      chunkContactMentions.push(...chunkResult.object.contacts_mentioned);
    }

    const certText = truncateText(certExtractedTextParts.join("\n\n"), 16000);
    const finalPrompt = [
      `Main CV file: ${mainCvFile.name}`,
      `CV chunk summaries:\n- ${chunkSummaries.join("\n- ")}`,
      `Certificate mentions in CV:\n${Array.from(new Set(chunkCertMentions)).join("\n- ") || "None detected"}`,
      `Experience mentions in CV:\n${Array.from(new Set(chunkExperienceMentions)).join("\n- ") || "None detected"}`,
      `Contact mentions in CV:\n${Array.from(new Set(chunkContactMentions)).join("\n- ") || "None detected"}`,
      `Raw extracted CV text (use this for completeness):\n${cvText || "No CV text extracted."}`,
      `Extracted certificate OCR/text:\n${certText || "No certificate OCR/text extracted."}`,
      "Generate polished markdown CV + structured JSON + ambassador copy. Do not omit valid experience entries found in source text.",
    ].join("\n\n");

    const aiResult = await generateObject({
      model: aiModel,
      system: cvSystemPrompt,
      schema: aiCvOutputSchema,
      prompt: finalPrompt,
    });

    const parsed = aiResult.object;
    const nowIso = new Date().toISOString();
    const payload = aiCvOutputToPayload(parsed, { sourceRef: cvPath, importBatchId });

    await saveDiverProfile(serviceSupabase, diverId, payload, {
      importBatchId,
      cvLastProcessedAt: nowIso,
    });

    return NextResponse.json({
      ok: true,
      disclaimer: AI_DISCLAIMER,
      warnings: extractionWarnings,
      importBatchId,
      uploaded: {
        cv: cvPath,
        certificates: certUploadResults.map((item) => item.path),
      },
      output: parsed,
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to process CV.", detail: String(error) }, { status: 500 });
  }
}
