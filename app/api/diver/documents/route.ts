import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { appendAgentTurn } from "@/lib/agent-messages";
import { getAgentThread, upsertWorkspaceThread } from "@/lib/agent-threads";
import { getAuthenticatedDiverContext } from "@/lib/diver-auth";
import {
  applyCertificateReads,
  pdfCopyFromImage,
  readAllCertificatesFromBytes,
} from "@/lib/cert-text";
import {
  listCertificateDocumentFiles,
  listDiverDocumentFiles,
  upsertDiverCertificateFile,
} from "@/lib/diver-documents";
import { displayCertificateName } from "@/lib/document-names";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const supabase = createServiceSupabaseClient();
    const [allFiles, profileResult, userResult] = await Promise.all([
      listDiverDocumentFiles(supabase, authResult.diverId),
      supabase
        .from("diver_profiles")
        .select("headline, updated_at, profile_status, cv_last_processed_at")
        .eq("user_id", authResult.diverId)
        .maybeSingle(),
      supabase.from("users").select("avatar_url").eq("id", authResult.diverId).maybeSingle(),
    ]);

    const certificates = listCertificateDocumentFiles(allFiles).map((file) => ({
      ...file,
      name: displayCertificateName(file.name),
    }));
    const headline = (profileResult.data?.headline ?? "").trim();
    const livingCv = {
      present: headline.length > 0 || Boolean(profileResult.data?.cv_last_processed_at),
      updatedAt: profileResult.data?.updated_at ?? null,
    };
    const profileStatus =
      profileResult.data?.profile_status === "published" ? "published" : "draft";
    const hasPhoto = Boolean(
      typeof userResult.data?.avatar_url === "string" && userResult.data.avatar_url.trim(),
    );

    return NextResponse.json({
      livingCv,
      profileStatus,
      hasPhoto,
      needsPhoto: profileStatus === "published" && !hasPhoto,
      certificates,
      documents: certificates,
    });
  } catch {
    return NextResponse.json({ error: "Unable to list diver documents." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const supabase = createServiceSupabaseClient();
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await req.json()) as {
        complete?: boolean;
        files?: Array<{
          name: string;
          action?: string;
          ticket?: string | null;
          expiry_date?: string | null;
          tickets?: Array<{
            name?: string | null;
            expiry_date?: string | null;
          }>;
        }>;
      };
      if (!body.complete) {
        return NextResponse.json({ error: "Nothing to complete." }, { status: 400 });
      }
      const files = body.files ?? [];
      const added = files.filter((item) => item.action === "added").map((item) => item.name);
      const renewed = files.filter((item) => item.action === "renewed").map((item) => item.name);
      const duplicates = files.filter((item) => item.action === "duplicate").map((item) => item.name);
      const dated = files.flatMap((item) => {
        const tickets = Array.isArray(item.tickets) ? item.tickets : null;
        if (tickets && tickets.length > 0) {
          return tickets.map((ticket) => {
            const label = ticket.name || item.ticket || item.name;
            return ticket.expiry_date ? `${label} (exp ${ticket.expiry_date})` : label;
          });
        }
        if (item.ticket || item.expiry_date) {
          const label = item.ticket || item.name;
          return [item.expiry_date ? `${label} (exp ${item.expiry_date})` : label];
        }
        return [] as string[];
      });
      const parts = [
        added.length ? `New file(s): ${added.join(", ")}.` : "",
        renewed.length ? `Renewed: ${renewed.join(", ")}.` : "",
        duplicates.length ? `Already on file: ${duplicates.join(", ")}.` : "",
        dated.length
          ? `Read ${dated.length} ticket(s) from the upload: ${dated.join("; ")}.`
          : "",
      ].filter(Boolean);
      const thread =
        (await getAgentThread(supabase, "web", authResult.diverId)) ??
        (await upsertWorkspaceThread(supabase, {
          userId: authResult.diverId,
          role: "diver",
          channel: "web",
          externalChatId: authResult.diverId,
        }));
      await appendAgentTurn(supabase, {
        threadId: thread.id,
        userContent: `Please store these certificate files: ${files.map((item) => item.name).join(", ") || "batch"}`,
        assistantContent:
          `${parts.join(" ") || `Stored ${files.length} certificate file(s).`} ` +
          "One PDF can contain many tickets — Hermes reads each one. " +
          "Job history on the living CV only changes when you upload a CV PDF or tell me a job to add. " +
          "If an expiry is missing, type the date. Then say match me to open campaigns.",
        metadata: { source: "documents-upload", count: files.length, ticketsRead: dated.length },
      });
      return NextResponse.json({ ok: true });
    }

    const formData = await req.formData();
    const certificateFiles = formData
      .getAll("certificates")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (certificateFiles.length === 0) {
      return NextResponse.json({ error: "Select at least one PDF, JPG, or PNG certificate." }, { status: 400 });
    }
    if (certificateFiles.length > 3) {
      return NextResponse.json({ error: "Send at most 3 files per request. The workspace uploads them in sequence." }, { status: 400 });
    }

    const existing = listCertificateDocumentFiles(await listDiverDocumentFiles(supabase, authResult.diverId));
    const uploaded = [];
    for (const file of certificateFiles) {
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: `${file.name} exceeds 10MB.` }, { status: 400 });
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const result = await upsertDiverCertificateFile(
        supabase,
        authResult.diverId,
        { name: file.name, bytes, contentType: file.type || "" },
        existing,
      );
      existing.push({
        name: result.name,
        path: result.path,
        created_at: new Date().toISOString(),
        size: bytes.length,
      });
      const reads = await readAllCertificatesFromBytes(bytes, file.name, file.type);
      if (reads.length > 0) {
        await applyCertificateReads(supabase, authResult.diverId, reads, file.name);
      }
      const pdfCopy = await pdfCopyFromImage(bytes, file.name, file.type);
      if (pdfCopy) {
        await upsertDiverCertificateFile(
          supabase,
          authResult.diverId,
          {
            name: file.name.replace(/\.[a-z0-9]+$/i, ".pdf"),
            bytes: pdfCopy,
            contentType: "application/pdf",
          },
          existing,
        );
      }
      const primary = reads[0];
      uploaded.push({
        name: file.name,
        action: result.action,
        path: result.path,
        issue_date: primary?.issue_date ?? null,
        expiry_date: primary?.expiry_date ?? null,
        ticket: primary?.name ?? null,
        tickets: reads.map((read) => ({
          name: read.name,
          issue_date: read.issue_date,
          expiry_date: read.expiry_date,
          source: read.source,
        })),
        ticketCount: reads.length,
        source: primary?.source ?? "none",
      });
    }

    return NextResponse.json({ ok: true, uploaded });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to store certificate.", detail: String(error) },
      { status: 500 },
    );
  }
}
