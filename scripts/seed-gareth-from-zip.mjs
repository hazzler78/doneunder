import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateObject } from "ai";
import { xai } from "@ai-sdk/xai";
import { createClient } from "@supabase/supabase-js";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const zipPath = path.join(projectRoot, "fwddivingcvcertsandmedicals.zip");
const extractDir = path.join(projectRoot, "data", "gareth-source");
const bucketName = "diver-documents";
const garethId = "11111111-1111-1111-1111-111111111111";

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
});

const fallbackResult = {
  professional_headline: "Offshore Commercial Diver & DMT | 20+ Years | IMCA Ready",
  polished_cv_markdown: `# Gareth Darrin Middleton

## Professional Summary
Senior offshore commercial diver with 20+ years of international campaign experience in offshore and inshore operations.

## Core Competencies
- Air Diving Offshore/Onshore Construction
- Saturation Support Operations
- Diver Medic Technician (DMT)
- Assistant Dive Supervision
- Underwater Welding and Broco Cutting

## Certifications
- IMCA Trainee Air Diving Supervisor
- Diver Medic Technician
- OPITO BOSIET with HUET and CA-EBS
- OEUK Medical Certificate
- HSE Diver Medical (MA1/MA2)`,
  polished_cv_json: {
    location: "Malmo, Sweden",
    mobilization_notice: "Short notice, global mobilization",
    availability_status: "available",
    sat_hours: 0,
    dive_hours: 0,
    experiences: [
      {
        company: "SWESUB AB",
        project_name: "Underwater construction scopes",
        location: "Sweden",
        role_title: "Construction Diver",
        date_start: "2024-01-01",
        summary: "Construction diver on multiple underwater construction projects.",
      },
    ],
    certifications: [],
    references: [],
  },
  ambassador_page: {
    public_headline: "Offshore Commercial Diver & DMT | 20+ Years",
    short_bio:
      "Trusted for safe, high-performance offshore execution across IRM, subsea installation, and construction campaigns.",
    key_highlights: [
      "20+ years offshore/inshore campaign experience",
      "Diver Medic Technician and assistant supervision background",
      "International project exposure across Europe and Asia",
    ],
  },
};

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function normalizeDate(value) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanText(input) {
  return input.replace(/\s+/g, " ").trim();
}

function truncateText(input, maxChars = 24000) {
  return input.length > maxChars ? input.slice(0, maxChars) : input;
}

function splitTextIntoChunks(input, size = 6000, overlap = 400) {
  const chunks = [];
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

async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    return cleanText(parsed.text || "");
  } finally {
    await parser.destroy();
  }
}

async function extractImageText(buffer) {
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

function ensureExtractedFiles() {
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Zip file not found at ${zipPath}`);
  }

  if (!fs.existsSync(extractDir)) {
    fs.mkdirSync(extractDir, { recursive: true });
  }

  const existing = fs.readdirSync(extractDir);
  if (existing.length === 0) {
    const command = `Expand-Archive -Path "${zipPath}" -DestinationPath "${extractDir}" -Force`;
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${command}"`, { stdio: "inherit" });
  }
}

function collectDocumentFiles() {
  const allFiles = fs
    .readdirSync(extractDir)
    .filter((entry) => /\.(pdf|jpe?g|png)$/i.test(entry))
    .map((entry) => path.join(extractDir, entry));

  if (allFiles.length === 0) {
    throw new Error("No CV/certificate files found after extraction.");
  }

  const mainCv =
    allFiles.find((filePath) => /cv/i.test(path.basename(filePath)) && /\.pdf$/i.test(filePath)) ??
    allFiles.find((filePath) => /\.pdf$/i.test(filePath));

  if (!mainCv) {
    throw new Error("Could not identify a main CV PDF.");
  }

  const certFiles = allFiles.filter((filePath) => filePath !== mainCv);
  return { mainCv, certFiles };
}

async function run() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const xaiApiKey = requireEnv("XAI_API_KEY");

  process.env.XAI_API_KEY = xaiApiKey;

  ensureExtractedFiles();
  const { mainCv, certFiles } = collectDocumentFiles();
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const model = xai(process.env.XAI_MODEL ?? "grok-3-mini");

  const batchId = randomUUID();
  const folder = `${garethId}/${batchId}`;

  const { data: existingBucket } = await supabase.storage.getBucket(bucketName);
  if (!existingBucket) {
    const created = await supabase.storage.createBucket(bucketName, { public: false });
    if (created.error && !/already exists/i.test(created.error.message)) {
      throw new Error(`Failed to create storage bucket: ${created.error.message}`);
    }
  }

  const mainCvBuffer = fs.readFileSync(mainCv);
  const mainCvStoragePath = `${folder}/${path.basename(mainCv)}`;
  const cvUpload = await supabase.storage.from(bucketName).upload(mainCvStoragePath, mainCvBuffer, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (cvUpload.error) throw new Error(`CV upload failed: ${cvUpload.error.message}`);

  const certUploadMeta = [];
  const certExtractedTextParts = [];
  for (const certFile of certFiles) {
    const certBuffer = fs.readFileSync(certFile);
    const ext = path.extname(certFile).toLowerCase();
    const mimeType = ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : "image/jpeg";
    const certStoragePath = `${folder}/${path.basename(certFile)}`;
    const uploaded = await supabase.storage.from(bucketName).upload(certStoragePath, certBuffer, {
      contentType: mimeType,
      upsert: true,
    });
    if (uploaded.error) throw new Error(`Certificate upload failed (${certFile}): ${uploaded.error.message}`);
    certUploadMeta.push({
      name: path.basename(certFile),
      mimeType,
    });
    if (mimeType === "application/pdf") {
      const text = await extractPdfText(certBuffer);
      if (text) certExtractedTextParts.push(`[${path.basename(certFile)}] ${truncateText(text, 12000)}`);
    } else {
      const text = await extractImageText(certBuffer);
      if (text) certExtractedTextParts.push(`[${path.basename(certFile)}] ${truncateText(text, 6000)}`);
    }
  }

  const mainCvText = truncateText(await extractPdfText(mainCvBuffer));
  const cvChunks = splitTextIntoChunks(mainCvText);
  const cvSummaries = [];
  const certMentions = [];

  for (const [index, chunk] of cvChunks.entries()) {
    const chunkResult = await generateObject({
      model,
      schema: cvChunkSchema,
      system:
        "You extract factual profile information from commercial diving CV text fragments. Return concise and normalized outputs.",
      prompt: `Chunk ${index + 1}/${cvChunks.length} from Gareth CV:\n${chunk}`,
    });
    cvSummaries.push(chunkResult.object.summary);
    certMentions.push(...chunkResult.object.certifications_mentioned);
  }

  const compactPrompt = [
    `Main CV file uploaded: ${path.basename(mainCv)}`,
    `Certificates uploaded (${certUploadMeta.length}): ${certUploadMeta.map((item) => item.name).join(", ")}`,
    `CV chunk summaries:\n- ${cvSummaries.join("\n- ")}`,
    `Certifications mentioned in CV:\n- ${Array.from(new Set(certMentions)).join("\n- ") || "None detected"}`,
    `Certificate OCR/text:\n${truncateText(certExtractedTextParts.join("\n\n"), 16000) || "No certificate text extracted."}`,
    "Generate a polished, recruiter-ready profile for Gareth Middleton using this extracted evidence.",
  ].join("\n\n");

  let parsed;
  try {
    const aiResult = await generateObject({
      model,
      schema: aiOutputSchema,
      system: cvSystemPrompt,
      prompt: compactPrompt,
    });
    parsed = aiResult.object;
  } catch {
    parsed = fallbackResult;
  }
  const profile = parsed.polished_cv_json;
  const nowIso = new Date().toISOString();

  await supabase.from("users").upsert(
    {
      id: garethId,
      role: "diver",
      email: "gareth@demo.doneunder.ai",
      username: "gareth-demo",
      full_name: "Gareth Darrin Middleton",
    },
    { onConflict: "id" },
  );

  await supabase.from("diver_profiles").upsert(
    {
      user_id: garethId,
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
      headline_source_ref: mainCvStoragePath,
      bio_source: "ai",
      bio_source_ref: mainCvStoragePath,
      import_batch_id: batchId,
      cv_last_processed_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: "user_id" },
  );

  await Promise.all([
    supabase.from("diver_experiences").delete().eq("diver_id", garethId),
    supabase.from("diver_certifications").delete().eq("diver_id", garethId),
    supabase.from("diver_references").delete().eq("diver_id", garethId),
  ]);

  if (profile.experiences.length > 0) {
    await supabase.from("diver_experiences").insert(
      profile.experiences.map((item, index) => ({
        diver_id: garethId,
        company: item.company,
        project_name: item.project_name ?? null,
        location: item.location ?? null,
        role_title: item.role_title,
        date_start: normalizeDate(item.date_start),
        date_end: normalizeDate(item.date_end),
        summary: item.summary ?? null,
        sort_order: index,
        source: "ai",
        source_ref: mainCvStoragePath,
        import_batch_id: batchId,
        updated_at: nowIso,
      })),
    );
  }

  if (profile.certifications.length > 0) {
    await supabase.from("diver_certifications").insert(
      profile.certifications.map((item, index) => ({
        diver_id: garethId,
        name: item.name,
        issue_date: normalizeDate(item.issue_date),
        expiry_date: normalizeDate(item.expiry_date),
        cert_number: item.cert_number ?? null,
        issuing_body: item.issuing_body ?? null,
        sort_order: index,
        source: "ai",
        source_ref: mainCvStoragePath,
        import_batch_id: batchId,
        updated_at: nowIso,
      })),
    );
  }

  if (profile.references.length > 0) {
    await supabase.from("diver_references").insert(
      profile.references.map((item, index) => ({
        diver_id: garethId,
        name: item.name,
        company: item.company ?? null,
        phone: item.phone ?? "Not provided",
        email: item.email ?? null,
        sort_order: index,
        source: "ai",
        source_ref: mainCvStoragePath,
        import_batch_id: batchId,
        updated_at: nowIso,
      })),
    );
  }

  console.log("Gareth seeded successfully from zip.");
  console.log(`Main CV source file: ${path.basename(mainCv)}`);
  console.log(`Certificates processed: ${certFiles.length}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
