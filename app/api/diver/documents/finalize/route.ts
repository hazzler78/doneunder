import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { getAuthenticatedDiverContext } from "@/lib/diver-auth";
import {
  applyCertificateReads,
  pdfCopyFromImage,
  readCertificatePack,
  type CertificatePackReport,
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

export const DEFERRED_CERTIFICATE_READ_NOTE =
  "Certificate saved. Ticket details are still being read; refresh your workspace shortly if dates are missing.";

export function pendingCertificatePackReport(): CertificatePackReport {
  return {
    totalPages: null,
    pagesRead: [],
    pagesSkipped: [],
    pagesFailed: [],
    errors: [],
    complete: false,
  };
}

type StoredCertificate = Awaited<ReturnType<typeof upsertDiverCertificateFile>>;

export function buildDeferredFinalizeUploadItem(input: {
  fileName: string;
  stored: StoredCertificate;
}) {
  return {
    name: input.fileName,
    action: input.stored.action,
    path: input.stored.path,
    issue_date: null,
    expiry_date: null,
    ticket: null,
    tickets: [] as Array<{
      name?: string | null;
      issue_date?: string | null;
      expiry_date?: string | null;
      source?: string | null;
    }>,
    ticketCount: 0,
    source: "none",
    readReport: pendingCertificatePackReport(),
    readWarnings: [DEFERRED_CERTIFICATE_READ_NOTE],
  };
}

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
      const { bytes, stored } = await storeCertificateFromStaging(supabase, diverId, {
        storagePath,
        name: fileName,
        contentType,
      });

      const elapsed = Date.now() - routeStartedAt;
      if (elapsed > STORE_RESERVE_MS) {
        console.warn("certificate finalize store phase slow", {
          diverId,
          fileName,
          elapsedMs: elapsed,
        });
      }

      const uploaded = buildDeferredFinalizeUploadItem({ fileName, stored });

      after(async () => {
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

      return NextResponse.json({ ok: true, deferredRead: true, uploaded: [uploaded] });
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
