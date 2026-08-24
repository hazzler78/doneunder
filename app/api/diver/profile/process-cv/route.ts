import { randomUUID } from "node:crypto";
import { generateObject } from "ai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createWorker } from "tesseract.js";
import { extractPdfText as readPdfBytes } from "@/lib/pdf-text";
import { z } from "zod";
import { AI_DISCLAIMER, ENGLISH_ONLY_INSTRUCTION, aiModel } from "@/lib/ai";
import { appendAgentTurn } from "@/lib/agent-messages";
import { getAgentThread, upsertWorkspaceThread } from "@/lib/agent-threads";
import { getAuthenticatedDiverContext } from "@/lib/diver-auth";
import { aiCvOutputSchema } from "@/lib/diver-profile";
import { classifyCertificateFile } from "@/lib/certificate-pack";
import { looksLikeCertificateFilename, looksLikeMainCvFilename } from "@/lib/document-names";
import {
  listCertificateDocumentFiles,
  listDiverDocumentFiles,
  upsertDiverCertificateFile,
} from "@/lib/diver-documents";
import { aiCvOutputToPayload, saveDiverProfile } from "@/lib/diver-profile-service";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET_NAME = "diver-documents";
const MAX_MAIN_CV_MB = 12;
const MAX_CERT_MB = 8;
const MAX_CERT_FILES = 20;
const MAX_SOURCE_TEXT_CHARS = 60000;
const CHUNK_SIZE = 6000;
const CHUNK_OVERLAP = 400;
const IS_VERCEL_RUNTIME = Boolean(process.env.VERCEL);

const cvSystemPrompt = `You are a specialist commercial diving CV and profile writer for doneunder.ai.
Turn raw CVs and certification documents into a polished, accurate profile for offshore recruiters.
${ENGLISH_ONLY_INSTRUCTION}
Return factual outputs only from provided material. Use "Not provided" when unknown.
Prioritize complete experience extraction: include all identifiable roles/projects from the source text, ordered most recent first.
Respond in the exact JSON schema requested. Every string field must be English.`;

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
  return readPdfBytes(buffer);
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
    const mainCvEntry = formData.get("mainCv");
    let mainCvFile = mainCvEntry instanceof File && mainCvEntry.size > 0 ? mainCvEntry : null;
    const certFiles = formData.getAll("certificates");

    const certificateFiles = certFiles.filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (
      mainCvFile &&
      certificateFiles.length === 0 &&
      looksLikeCertificateFilename(mainCvFile.name) &&
      !looksLikeMainCvFilename(mainCvFile.name)
    ) {
      certificateFiles.unshift(mainCvFile);
      mainCvFile = null;
    }
    if (!mainCvFile && certificateFiles.length === 0) {
      return NextResponse.json({ error: "Upload a CV PDF and/or certificate files (PDF, JPG, PNG)." }, { status: 400 });
    }
    if (mainCvFile && mainCvFile.type !== "application/pdf" && !mainCvFile.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Main CV must be a PDF." }, { status: 400 });
    }

    if (certificateFiles.length > MAX_CERT_FILES) {
      return NextResponse.json({ error: `Maximum ${MAX_CERT_FILES} certificate files allowed.` }, { status: 400 });
    }

    if (mainCvFile) validateFile(mainCvFile, MAX_MAIN_CV_MB);
    for (const certFile of certificateFiles) {
      const validType =
        certFile.type === "application/pdf" ||
        certFile.type === "image/jpeg" ||
        certFile.type === "image/jpg" ||
        certFile.type === "image/png" ||
        /\.(pdf|png|jpe?g)$/i.test(certFile.name);
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
    const diverId = authResult.diverId;
    const existingFiles = listCertificateDocumentFiles(await listDiverDocumentFiles(serviceSupabase, diverId));

    let cvBuffer: Buffer | null = null;
    let cvPath = "";
    if (mainCvFile) {
      cvBuffer = Buffer.from(await mainCvFile.arrayBuffer());
      cvPath = `${diverId}/source/original-cv.pdf`;
      const cvUpload = await serviceSupabase.storage.from(BUCKET_NAME).upload(cvPath, cvBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (cvUpload.error) {
        return NextResponse.json({ error: `Failed to upload CV: ${cvUpload.error.message}` }, { status: 400 });
      }
    }

    const certUploadResults: { path: string; mimeType: string; name: string; action: string }[] = [];
    const certExtractedTextParts: string[] = [];
    const extractionWarnings: string[] = [];
    for (const certFile of certificateFiles) {
      const certBuffer = Buffer.from(await certFile.arrayBuffer());
      const kind = classifyCertificateFile(certFile.name, certFile.type) ?? "jpg";
      const uploaded = await upsertDiverCertificateFile(
        serviceSupabase,
        diverId,
        { name: certFile.name, bytes: certBuffer, contentType: certFile.type || "" },
        existingFiles,
      );
      existingFiles.push({
        name: uploaded.name,
        path: uploaded.path,
        created_at: new Date().toISOString(),
        size: certBuffer.length,
      });
      certUploadResults.push({
        path: uploaded.path,
        mimeType: uploaded.mimeType,
        name: certFile.name,
        action: uploaded.action,
      });

      if (kind === "pdf") {
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

    const thread =
      (await getAgentThread(serviceSupabase, "web", diverId)) ??
      (await upsertWorkspaceThread(serviceSupabase, {
        userId: diverId,
        role: "diver",
        channel: "web",
        externalChatId: diverId,
      }));

    if (!mainCvFile || !cvBuffer) {
      const added = certUploadResults.filter((item) => item.action === "added").map((item) => item.name);
      const renewed = certUploadResults.filter((item) => item.action === "renewed").map((item) => item.name);
      const duplicates = certUploadResults.filter((item) => item.action === "duplicate").map((item) => item.name);
      const parts = [
        added.length ? `New: ${added.join(", ")}.` : "",
        renewed.length ? `Renewed (replaced existing): ${renewed.join(", ")}.` : "",
        duplicates.length ? `Already on file, unchanged: ${duplicates.join(", ")}.` : "",
      ].filter(Boolean);
      const certReply =
        `${parts.join(" ") || `Stored ${certUploadResults.length} certificate file(s).`} ` +
        "Job history on the living CV only changes when you upload a CV PDF or tell me a job to add. " +
        "If an expiry is missing, type the date. Then say match me to open campaigns. " +
        (extractionWarnings.length ? `Notes: ${extractionWarnings.join(" ")}` : "");
      await appendAgentTurn(serviceSupabase, {
        threadId: thread.id,
        userContent: `Please store these certificate files: ${certificateFiles.map((file) => file.name).join(", ")}`,
        assistantContent: certReply,
        metadata: { source: "process-cv", importBatchId, certificatesOnly: true },
      });
      return NextResponse.json({
        ok: true,
        certificatesOnly: true,
        warnings: extractionWarnings,
        importBatchId,
        uploaded: {
          cv: null,
          certificates: certUploadResults.map((item) => item.path),
        },
      });
    }

    const cvText = truncateText(await extractPdfText(cvBuffer));
    if (!cvText) {
      extractionWarnings.push(
        "Could not read text from the CV PDF. The file is stored — paste the CV text in this chat and Hermes will build it.",
      );
      await appendAgentTurn(serviceSupabase, {
        threadId: thread.id,
        userContent: `Please process this CV PDF: ${mainCvFile.name}`,
        assistantContent: extractionWarnings.join(" "),
        metadata: { source: "process-cv", importBatchId, unreadablePdf: true },
      });
      return NextResponse.json({
        ok: true,
        warnings: extractionWarnings,
        importBatchId,
        uploaded: { cv: cvPath, certificates: certUploadResults.map((item) => item.path) },
      });
    }
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
          "You extract normalized, factual profile data from commercial diving CV fragments. Return concise English output and no hallucinations. Translate non-English source text into English.",
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
      "Generate polished English markdown CV + structured JSON + ambassador copy. Translate any non-English source into English. Do not omit valid experience entries found in source text.",
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
      preserveEmptyChildSections: true,
    });

    const cvReply =
      "CV processed in English. Preview at /preview/cv. " +
      (extractionWarnings.length
        ? `Some OCR parts were skipped: ${extractionWarnings.join(" ")} `
        : "") +
      "Attach ticket photos (IMCA, BOSIET, medical) if they are not in the file list yet. Then say match me to open campaigns.";

    await appendAgentTurn(serviceSupabase, {
      threadId: thread.id,
      userContent: `Please process this CV PDF: ${mainCvFile.name}`,
      assistantContent: cvReply,
      metadata: { source: "process-cv", importBatchId },
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
