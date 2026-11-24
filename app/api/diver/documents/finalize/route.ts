import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { getAuthenticatedDiverContext } from "@/lib/diver-auth";
import { buildDeferredFinalizeUploadItem } from "@/lib/browser-upload";
import {
  applyCertificateReads,
  pdfCopyFromImage,
  readCertificatePack,
} from "@/lib/cert-text";
import {
  listCertificateDocumentFiles,
  listDiverDocumentFiles,
  upsertDiverCertificateFile,
} from "@/lib/diver-documents";
import {
  downloadDiverDocumentBytes,
  removeDiverDocumentPaths,
  assertCertificateStagingPath,
  validateCertificateBytes,
} from "@/lib/diver-storage-upload";
import { DEFAULT_PACK_DEADLINE_MS } from "@/lib/cert-pack-read";
import { logDiverUploadFailure } from "@/lib/upload-failure-log";
import { notifyDeferredCertZeroRead } from "@/lib/deferred-cert-read-followup";
import { logAgentInteraction } from "@/lib/audit";
import {
  certificatePanelCvMisrouteLooksLike,
  promoteCertificateStagingToMainCv,
} from "@/lib/certificate-panel-cv-routing";
import { diverHasStoredCv } from "@/lib/diver-stored-cv";
import { looksLikeMainCvFilename } from "@/lib/document-names";

export const runtime = "nodejs";
/** Store + background pack read; keep under Vercel Pro serverless max (300 s). */
export const maxDuration = 300;

/** Leave room for auth, download, and storage upload before the HTTP response is sent. */
const STORE_RESERVE_MS = 30_000;
/** Background read budget after the client gets a response (same invocation via after()). */
const BACKGROUND_READ_DEADLINE_MS = Math.min(
  240_000,
  Math.max(DEFAULT_PACK_DEADLINE_MS, 120_000),
);

async function storeCertificateFromStaging(
  supabase: SupabaseClient,
  diverId: string,
  input: { storagePath: string; name: string; contentType?: string },
) {
  const path = assertCertificateStagingPath(diverId, input.storagePath);
  const bytes = await downloadDiverDocumentBytes(supabase, path);
  const byteCheck = validateCertificateBytes(bytes, {
    name: input.name,
    contentType: input.contentType,
  });
  if (!byteCheck.ok) {
    throw new Error(byteCheck.error);
  }
  const existing = listCertificateDocumentFiles(await listDiverDocumentFiles(supabase, diverId));
  const stored = await upsertDiverCertificateFile(
    supabase,
    diverId,
    {
      name: input.name,
      bytes,
      contentType: input.contentType ?? "",
    },
    existing,
  );
  await removeDiverDocumentPaths(supabase, [path]);
  return { bytes, stored };
}

async function readCertificatePackInBackground(
  supabase: SupabaseClient,
  diverId: string,
  input: {
    bytes: Buffer;
    fileName: string;
    contentType: string;
    storagePath: string;
  },
) {
  const { reads } = await readCertificatePack(
    input.bytes,
    input.fileName,
    input.contentType,
    { actorId: diverId, filename: input.fileName },
    { deadlineMs: BACKGROUND_READ_DEADLINE_MS },
  );
  if (reads.length > 0) {
    await applyCertificateReads(supabase, diverId, reads, input.fileName, input.storagePath);
  } else {
    await logAgentInteraction({
      actorId: diverId,
      feature: "cert_vision_zero_read",
      input: { filename: input.fileName, bytes: input.bytes.length, source: "deferred_pdf_pack" },
      output: { ticketCount: 0, source: "deferred_finalize" },
    });
    try {
      await notifyDeferredCertZeroRead(supabase, diverId, input.fileName);
    } catch (notifyError) {
      console.error("deferred cert zero-read follow-up failed", {
        diverId,
        fileName: input.fileName,
        notifyError,
      });
    }
  }
  const pdfCopy = await pdfCopyFromImage(input.bytes, input.fileName, input.contentType);
  if (pdfCopy) {
    const fileList = listCertificateDocumentFiles(await listDiverDocumentFiles(supabase, diverId));
    await upsertDiverCertificateFile(
      supabase,
      diverId,
      {
        name: input.fileName.replace(/\.[a-z0-9]+$/i, ".pdf"),
        bytes: pdfCopy,
        contentType: "application/pdf",
      },
      fileList,
    );
  }
}

export async function POST(req: Request) {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const body = (await req.json()) as {
      path?: string;
      fileName?: string;
      contentType?: string;
      fileSize?: number;
    };
    const storagePath = typeof body.path === "string" ? body.path : "";
    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
    const contentType = typeof body.contentType === "string" ? body.contentType : "";
    const fileSize = typeof body.fileSize === "number" ? body.fileSize : 0;

    if (!storagePath || !fileName) {
      return NextResponse.json({ error: "Missing storage path or file name." }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();
    const diverId = authResult.diverId;

    try {
      assertCertificateStagingPath(diverId, storagePath);
    } catch {
      return NextResponse.json({ error: "Invalid certificate upload path." }, { status: 400 });
    }

    const routeStartedAt = Date.now();
    try {
      const hasStoredCv = await diverHasStoredCv(supabase, diverId);
      const looksLikeCv = looksLikeMainCvFilename(fileName);

      if (looksLikeCv && !hasStoredCv) {
        const mainCv = await promoteCertificateStagingToMainCv(supabase, diverId, {
          stagingPath: storagePath,
          fileName,
          contentType,
        });
        return NextResponse.json({
          ok: true,
          reroutedToCv: true,
          mainCv: {
            path: mainCv.path,
            name: mainCv.name,
            fileSize: mainCv.fileSize,
          },
        });
      }

      const { bytes, stored } = await storeCertificateFromStaging(supabase, diverId, {
        storagePath,
        name: fileName,
        contentType,
      });

      const cvMisroute = certificatePanelCvMisrouteLooksLike(fileName, hasStoredCv);

      const elapsed = Date.now() - routeStartedAt;
      if (elapsed > STORE_RESERVE_MS) {
        console.warn("certificate finalize store phase slow", {
          diverId,
          fileName,
          elapsedMs: elapsed,
        });
      }

      const uploaded = cvMisroute
        ? {
            name: fileName,
            action: stored.action,
            ticketCount: 0,
            tickets: [] as Array<{ name?: string | null; expiry_date?: string | null }>,
            cvMisroute: true,
            readReport: {
              totalPages: null,
              pagesRead: [] as number[],
              pagesSkipped: [] as number[],
              pagesFailed: [] as number[],
              errors: [] as string[],
              complete: true,
            },
          }
        : buildDeferredFinalizeUploadItem({ fileName, stored });

      after(async () => {
        if (cvMisroute) return;
        try {
          await readCertificatePackInBackground(supabase, diverId, {
            bytes,
            fileName,
            contentType,
            storagePath: stored.path,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("deferred certificate pack read failed", {
            diverId,
            fileName,
            message,
          });
          await logDiverUploadFailure(supabase, diverId, {
            fileName,
            fileSize,
            error: message,
            source: "documents-finalize-deferred-read",
          });
        }
      });

      return NextResponse.json({
        ok: true,
        deferredRead: !cvMisroute,
        uploaded: [uploaded],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logDiverUploadFailure(supabase, diverId, {
        fileName,
        fileSize,
        error: message,
        source: "documents-finalize",
      });
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to finalize upload.", detail: String(error) },
      { status: 500 },
    );
  }
}
