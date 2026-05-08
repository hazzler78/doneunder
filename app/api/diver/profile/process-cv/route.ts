import { randomUUID } from "node:crypto";
import { generateObject } from "ai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { createWorker } from "tesseract.js";
import { z } from "zod";
import { AI_DISCLAIMER, aiModel } from "@/lib/ai";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BUCKET_NAME = "diver-documents";
const MAX_MAIN_CV_MB = 12;
const MAX_CERT_MB = 8;
const MAX_CERT_FILES = 10;
const MAX_SOURCE_TEXT_CHARS = 24000;
const CHUNK_SIZE = 6000;
const CHUNK_OVERLAP = 400;

const aiOutputSchema = z.object({
  professional_headline: z.string().min(1).max(220),
  polished_cv_markdown: z.string().min(1),
  polished_cv_json: z.object({
    location: z.string().optional(),
    mobilization_notice: z.string().optional(),
    availability_status: z.enum(["available", "deployed"]).optional(),
    sat_hours: z.number().int().min(0).optional(),
    dive_hours: z.number().int().min(0).optional(),
    experiences: z
      .array(
        z.object({
          company: z.string().min(1),
          project_name: z.string().optional(),
          location: z.string().optional(),
          role_title: z.string().min(1),
          date_start: z.string().optional(),
          date_end: z.string().optional(),
          summary: z.string().optional(),
        }),
      )
      .default([]),
    certifications: z
      .array(
        z.object({
          name: z.string().min(1),
          issue_date: z.string().optional(),
          expiry_date: z.string().optional(),
          cert_number: z.string().optional(),
          issuing_body: z.string().optional(),
        }),
      )
      .default([]),
    references: z
      .array(
        z.object({
          name: z.string().min(1),
          company: z.string().optional(),
          phone: z.string().optional(),
          email: z.string().optional(),
        }),
      )
      .default([]),
  }),
  ambassador_page: z.object({
    public_headline: z.string().min(1).max(220),
    short_bio: z.string().min(1).max(1200),
    key_highlights: z.array(z.string().min(1).max(180)).max(12),
  }),
});

const cvSystemPrompt = `You are a specialist commercial diving CV and profile writer for doneunder.ai.
Turn raw CVs and certification documents into a polished, accurate profile for offshore recruiters.
Return factual outputs only from provided material. Use "Not provided" when unknown.
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
  const worker = await createWorker("eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    return cleanText(text || "");
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

function normalizeDate(value?: string) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

async function getAuthenticatedDiver() {
  const supabase = await createSupabaseServerClient();
  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  let { data: userRecord } = await serviceSupabase
    .from("users")
    .select("id, role, full_name, username")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!userRecord) {
    const fullName =
      (auth.user.user_metadata?.full_name as string | undefined)?.trim() ||
      (auth.user.email ? auth.user.email.split("@")[0] : "Diver");
    const username =
      (auth.user.user_metadata?.username as string | undefined)?.trim().toLowerCase() ||
      (auth.user.email ? auth.user.email.split("@")[0].toLowerCase() : `diver-${auth.user.id.slice(0, 8)}`);

    const { data: inserted, error: insertError } = await serviceSupabase
      .from("users")
      .upsert(
        {
          id: auth.user.id,
          role: "diver",
          email: auth.user.email ?? `${auth.user.id}@placeholder.local`,
          username,
          full_name: fullName,
        },
        { onConflict: "id" },
      )
      .select("id, role, full_name, username")
      .maybeSingle();

    if (!insertError) {
      userRecord = inserted ?? null;
    }
  }

  if (userRecord && userRecord.role !== "diver") {
    return {
      error: NextResponse.json(
        { error: "Forbidden. This action requires a diver account." },
        { status: 403 },
      ),
    };
  }

  return { diverId: auth.user.id };
}

export async function POST(req: Request) {
  try {
    ensureEnv();
    const authResult = await getAuthenticatedDiver();
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
        const extracted = await extractPdfText(certBuffer);
        if (extracted) certExtractedTextParts.push(`[${certFile.name}] ${truncateText(extracted, 12000)}`);
      } else {
        const extracted = await extractImageText(certBuffer);
        if (extracted) certExtractedTextParts.push(`[${certFile.name}] ${truncateText(extracted, 6000)}`);
      }
    }

    const cvText = truncateText(await extractPdfText(cvBuffer));
    const cvChunks = splitTextIntoChunks(cvText);
    const chunkSummaries: string[] = [];
    const chunkCertMentions: string[] = [];

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
    }

    const certText = truncateText(certExtractedTextParts.join("\n\n"), 16000);
    const finalPrompt = [
      `Main CV file: ${mainCvFile.name}`,
      `CV chunk summaries:\n${chunkSummaries.join("\n- ")}`,
      `Certificate mentions in CV:\n${Array.from(new Set(chunkCertMentions)).join("\n- ") || "None detected"}`,
      `Extracted certificate OCR/text:\n${certText || "No certificate OCR/text extracted."}`,
      "Generate polished markdown CV + structured JSON + ambassador copy.",
    ].join("\n\n");

    const aiResult = await generateObject({
      model: aiModel,
      system: cvSystemPrompt,
      schema: aiOutputSchema,
      prompt: finalPrompt,
    });

    const parsed = aiResult.object;
    const profile = parsed.polished_cv_json;
    const nowIso = new Date().toISOString();

    await serviceSupabase.from("diver_profiles").upsert(
      {
        user_id: authResult.diverId,
        headline: parsed.professional_headline,
        bio: parsed.ambassador_page.short_bio,
        location: profile.location ?? "",
        mobilization_notice: profile.mobilization_notice ?? "",
        availability_status: profile.availability_status ?? "available",
        sat_hours: profile.sat_hours ?? 0,
        dive_hours: profile.dive_hours ?? 0,
        polished_cv_markdown: parsed.polished_cv_markdown,
        polished_cv_json: profile,
        ambassador_public_headline: parsed.ambassador_page.public_headline,
        ambassador_short_bio: parsed.ambassador_page.short_bio,
        ambassador_key_highlights: parsed.ambassador_page.key_highlights,
        headline_source: "ai",
        headline_source_ref: cvPath,
        bio_source: "ai",
        bio_source_ref: cvPath,
        import_batch_id: importBatchId,
        updated_at: nowIso,
      },
      { onConflict: "user_id" },
    );

    await Promise.all([
      serviceSupabase.from("diver_experiences").delete().eq("diver_id", authResult.diverId),
      serviceSupabase.from("diver_certifications").delete().eq("diver_id", authResult.diverId),
      serviceSupabase.from("diver_references").delete().eq("diver_id", authResult.diverId),
    ]);

    if (profile.experiences.length > 0) {
      await serviceSupabase.from("diver_experiences").insert(
        profile.experiences.map((item, index) => ({
          diver_id: authResult.diverId,
          company: item.company,
          project_name: item.project_name ?? null,
          location: item.location ?? null,
          role_title: item.role_title,
          date_start: normalizeDate(item.date_start),
          date_end: normalizeDate(item.date_end),
          summary: item.summary ?? null,
          sort_order: index,
          source: "ai",
          source_ref: cvPath,
          import_batch_id: importBatchId,
          updated_at: nowIso,
        })),
      );
    }

    if (profile.certifications.length > 0) {
      await serviceSupabase.from("diver_certifications").insert(
        profile.certifications.map((item, index) => ({
          diver_id: authResult.diverId,
          name: item.name,
          issue_date: normalizeDate(item.issue_date),
          expiry_date: normalizeDate(item.expiry_date),
          cert_number: item.cert_number ?? null,
          issuing_body: item.issuing_body ?? null,
          sort_order: index,
          source: "ai",
          source_ref: cvPath,
          import_batch_id: importBatchId,
          updated_at: nowIso,
        })),
      );
    }

    if (profile.references.length > 0) {
      await serviceSupabase.from("diver_references").insert(
        profile.references.map((item, index) => ({
          diver_id: authResult.diverId,
          name: item.name,
          company: item.company ?? null,
          phone: item.phone ?? "Not provided",
          email: item.email ?? null,
          sort_order: index,
          source: "ai",
          source_ref: cvPath,
          import_batch_id: importBatchId,
          updated_at: nowIso,
        })),
      );
    }

    return NextResponse.json({
      ok: true,
      disclaimer: AI_DISCLAIMER,
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
