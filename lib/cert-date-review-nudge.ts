import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAgentMessage } from "@/lib/agent-messages";
import { getAgentThread, upsertWorkspaceThread } from "@/lib/agent-threads";
import { isLifetimeCertificate } from "@/lib/cert-lifetime";
import { formatCertificateDate } from "@/lib/dates";
import { getDiverProfile } from "@/lib/diver-profile-service";

/** Stable marker in agent_messages.metadata — once per diver. */
export const CERT_DATE_REVIEW_SOURCE = "cert_date_review_prompt";

export type CertDateReviewRow = {
  name: string;
  expiry_date?: string | null;
  issuing_body?: string | null;
  no_expiry?: boolean | null;
};

export function formatCertExpiryForReview(cert: CertDateReviewRow): string {
  if (isLifetimeCertificate(cert)) return "no expiry";
  const formatted = formatCertificateDate(cert.expiry_date);
  return formatted ?? "not on file";
}

export function buildCertDateReviewMessage(certs: CertDateReviewRow[]): string {
  const lines = certs.map((cert) => {
    const name = cert.name?.trim() || "Certificate";
    return `• ${name} — ${formatCertExpiryForReview(cert)}`;
  });

  return (
    "Quick check on your tickets — we want every expiry date to be right on your profile.\n\n" +
    "Here is what we have on file:\n" +
    lines.join("\n") +
    "\n\n" +
    "If any expiry looks wrong (or a lifetime ticket should say no expiry), reply here with the correct date " +
    "or tell me which ticket to fix. I'll update it for you.\n\n" +
    "You can reply in any language."
  );
}

export function certDateReviewAlreadyShown(
  messages: Array<{ role: string; metadata?: Record<string, unknown> | null }>,
): boolean {
  return messages.some(
    (row) =>
      row.role === "assistant" &&
      row.metadata &&
      typeof row.metadata === "object" &&
      row.metadata.source === CERT_DATE_REVIEW_SOURCE,
  );
}

async function certDateReviewShownOnThread(supabase: SupabaseClient, threadId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("agent_messages")
    .select("metadata, role")
    .eq("thread_id", threadId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) throw new Error(error.message);
  return certDateReviewAlreadyShown((data ?? []) as Array<{ role: string; metadata?: Record<string, unknown> }>);
}

/**
 * One-time Hermes prompt listing certificate expiries so divers can catch bad dates from older imports.
 */
export async function maybeNudgeCertDateReview(
  supabase: SupabaseClient,
  input: { diverId: string; role?: "diver" | "company" },
): Promise<{ nudged: boolean; hasCertificates: boolean }> {
  const profile = await getDiverProfile(supabase, input.diverId);
  const certs = profile.certifications ?? [];
  if (certs.length === 0) {
    return { nudged: false, hasCertificates: false };
  }

  const existingThread = await getAgentThread(supabase, "web", input.diverId);
  if (existingThread && (await certDateReviewShownOnThread(supabase, existingThread.id))) {
    return { nudged: false, hasCertificates: true };
  }

  const thread =
    existingThread ??
    (await upsertWorkspaceThread(supabase, {
      userId: input.diverId,
      role: input.role ?? "diver",
      channel: "web",
      externalChatId: input.diverId,
    }));

  if (await certDateReviewShownOnThread(supabase, thread.id)) {
    return { nudged: false, hasCertificates: true };
  }

  const content = buildCertDateReviewMessage(certs);
  await appendAgentMessage(supabase, {
    threadId: thread.id,
    role: "assistant",
    content,
    metadata: { source: CERT_DATE_REVIEW_SOURCE },
  });

  return { nudged: true, hasCertificates: true };
}
