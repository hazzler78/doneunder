import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { aiModel, ENGLISH_ONLY_INSTRUCTION } from "@/lib/ai";
import {
  applyConversationalCvUpdate,
  getDiverProfile,
  persistMissingChildRowsFromJson,
  publishDiverProfile,
  validateDiverProfile,
} from "@/lib/diver-profile-service";
import { conversationalCvUpdateSchema, formatProfileZodError, type DiverProfileFull } from "@/lib/diver-profile";
import { sendEmailAsLoggedInUser, inboundReplyToAddress, parseEmailAddress, type EmailAttachment } from "@/lib/email";
import { buildDiverCvPdf, cvPdfFilename } from "@/lib/cv-pdf";
import { applyCertificateRead, readCertificateBytes } from "@/lib/cert-text";
import {
  buildCertificateAttachments,
  DIVER_DOCUMENTS_BUCKET,
  listCertificateDocumentFiles,
  listDiverDocumentFiles,
} from "@/lib/diver-documents";
import { isAiConfigured, isEmailConfigured } from "@/lib/feature-flags";
import {
  applicationDraft,
  applyBlockReason,
  findCatalogJob,
  formatMatchReason,
  isJobOpen,
  loadOpenJobs,
  scoreDiverAgainstJob,
  type PublicJob,
} from "@/lib/jobs";
import { CONTACT_EMAIL } from "@/lib/site";
import { logAgentInteraction } from "@/lib/audit";
import {
  isInboundFollowUpConfirmation,
  isInboundFollowUpDecline,
  type PendingInbound,
  type PendingInboundStatus,
} from "@/lib/inbound-email";

export type JobSuggestion = {
  id: string;
  title: string;
  location: string;
  reason: string;
  score: number;
};

export type HermesChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type HermesDiverTurnInput = {
  supabase: SupabaseClient;
  diverId: string;
  username: string | null;
  displayName: string;
  userEmail: string | null;
  message: string;
  history?: HermesChatMessage[];
  pendingInbound?: PendingInbound | null;
};

export type HermesDiverTurnResult = {
  reply: string;
  suggestions: JobSuggestion[];
  profile: DiverProfileFull;
  cvUpdated: boolean;
  updatedParts: string[];
  pendingInboundStatus?: PendingInboundStatus;
};

function truncateText(value: string | null | undefined, max = 280) {
  const text = value?.trim() ?? "";
  if (!text) return undefined;
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function ticketsFromProfile(profile: DiverProfileFull) {
  return profile.certifications.map((cert) => ({
    name: cert.name,
    expiryDate: cert.expiry_date ?? null,
  }));
}

function matchProfileToJob(job: PublicJob, profile: DiverProfileFull) {
  return scoreDiverAgainstJob(job, {
    certs: ticketsFromProfile(profile),
    location: profile.profile.location,
  });
}

function scoreJobsForDiver(jobs: PublicJob[], profile: DiverProfileFull): JobSuggestion[] {
  return jobs
    .map((job) => {
      const match = matchProfileToJob(job, profile);
      return {
        id: job.id,
        title: job.title,
        location: job.location,
        reason: formatMatchReason(match),
        score: match.score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function buildProfileContext(
  profile: DiverProfileFull,
  username: string | null,
  displayName: string,
  userEmail: string | null,
  pendingInbound?: PendingInbound | null,
) {
  const p = profile.profile;
  const validation = validateDiverProfile({
    headline: p.headline,
    bio: p.bio,
    location: p.location,
    mobilization_notice: p.mobilization_notice,
    availability_status: p.availability_status,
    sat_hours: p.sat_hours,
    dive_hours: p.dive_hours,
    polished_cv_markdown: p.polished_cv_markdown ?? undefined,
    polished_cv_json: p.polished_cv_json,
    ambassador_public_headline: p.ambassador_public_headline ?? undefined,
    ambassador_short_bio: p.ambassador_short_bio ?? undefined,
    ambassador_key_highlights: p.ambassador_key_highlights ?? undefined,
    experiences: profile.experiences,
    certifications: profile.certifications,
    references: profile.references,
  });

  return {
    diver: {
      displayName,
      email: userEmail,
      username,
      publicPath: username ? `/${username}` : null,
      previewPath: "/preview",
      cvPreviewPath: "/preview/cv",
    },
    email_capability: {
      configured: isEmailConfigured(),
      sends_as: userEmail
        ? "Logged-in diver identity (From when domain allows, otherwise Reply-To)"
        : "Unavailable — account email missing",
      inbound_reply_to: inboundReplyToAddress(username),
    },
    pending_inbound: pendingInbound ?? null,
    profile: {
      headline: p.headline || p.ambassador_public_headline || "",
      bio: p.bio || "",
      ambassador_public_headline: p.ambassador_public_headline,
      ambassador_short_bio: p.ambassador_short_bio,
      ambassador_key_highlights: p.ambassador_key_highlights ?? [],
      location: p.location,
      mobilization_notice: p.mobilization_notice,
      availability_status: p.availability_status,
      sat_hours: p.sat_hours,
      dive_hours: p.dive_hours,
      profile_status: p.profile_status,
      cv_last_processed_at: p.cv_last_processed_at,
      has_polished_cv: Boolean(p.polished_cv_markdown?.trim() || p.polished_cv_json),
    },
    counts: {
      experiences: profile.experiences.length,
      certifications: profile.certifications.length,
      references: profile.references.length,
    },
    polished_cv_markdown_excerpt:
      profile.experiences.length === 0 ? truncateText(p.polished_cv_markdown, 4000) : undefined,
    experiences: profile.experiences.map((exp) => ({
      id: exp.id,
      role_title: exp.role_title,
      company: exp.company,
      project_name: exp.project_name,
      location: exp.location,
      date_start: exp.date_start,
      date_end: exp.date_end,
      summary: truncateText(exp.summary),
    })),
    certifications: profile.certifications.map((cert) => ({
      id: cert.id,
      name: cert.name,
      issuing_body: cert.issuing_body,
      cert_number: cert.cert_number,
      issue_date: cert.issue_date,
      expiry_date: cert.expiry_date,
    })),
    references: profile.references.map((ref) => ({
      id: ref.id,
      name: ref.name,
      company: ref.company,
      phone: ref.phone,
      email: ref.email,
    })),
    validation: {
      errors: validation.errors,
      warnings: validation.warnings,
    },
  };
}

function buildSystemPrompt(context: ReturnType<typeof buildProfileContext>) {
  return `You are Hermes, the DoneUnder diver profile agent.

You help commercial divers build, refine, review, and publish their CV and ambassador profile, find matching offshore jobs, and send professional emails on their behalf.

Language:
- ${ENGLISH_ONLY_INSTRUCTION}
- Always reply in English, even if the diver writes in another language. Understand them, then answer and save CV text in English.

Conversation style:
- Talk naturally, like a knowledgeable recruiter — not a command menu.
- Answer questions directly using the profile context below (e.g. "how does it look?", "can you see my CV?", "what's missing?").
- Keep replies concise but helpful — a short paragraph or a few bullets, not a wall of text unless they ask for detail.

One living CV:
- There is a single living CV: the profile you maintain. Chat updates via update_cv are the source of truth. When they ask to send their CV, attach that living CV PDF — never an old uploaded file.
- An uploaded CV PDF is only a first import (or a rare full replace). After a living CV exists, do NOT ask them to upload another CV.
- Certificates are separate documents. They stay until renewed. If they already have that ticket, do not add a duplicate. If they upload a new scan of the same ticket, treat it as a renewal and replace the old scan.

Updating the CV from chat (this is the main way to edit):
- When the diver wants ANY change to their CV or profile, you MUST call update_cv. Do not claim you updated anything unless the tool returns ok=true.
- They can talk in plain English: "add this job", "set sat hours to 2100", "rewrite my summary", "add my IMCA ticket", or paste CV text.
- Use add_* for new rows, update_* for existing rows (match by id, company, role, or certificate name), remove_* to delete, and replace_* only when they paste a full CV or clearly want a whole section rewritten.
- For a new job, always call update_cv with add_experiences. Put company, a short role_title (extract one from the job description if they did not label it), dates, and summary. Do not send them to re-upload a PDF when they already typed the job in chat.
- Write every stored field in English. Translate if needed; keep official certificate titles and proper names.
- After a successful update_cv (ok=true), briefly confirm what you saved and invite them to preview /preview/cv.
- If update_cv returns ok=false, tell them it was NOT saved and quote the error. Do not link /preview/cv as if the change is there.
- validation.warnings (for example missing cert expiry dates) do NOT block adding a job. Only a failed update_cv call blocks a save.
- If the profile is empty (no headline, no experiences, no certifications), this is first-run. Invite them to attach a CV PDF and ticket photos (IMCA, BOSIET/FOET, medical) in this chat. Do not send them to a form. Do not claim they fit a campaign until match_job has run against real tickets.
- If the profile already has a headline, experiences, or a stored CV, do NOT ask them to upload a CV again. Certificates can be added on their own; the existing CV stays.
- If counts.experiences is 0, the public CV currently shows "No project history has been added yet." That is the most important gap. Extract jobs from the diver's message, pasted CV text, or profile.polished markdown/json and call update_cv with add_experiences or replace_experiences. Do not say the CV is complete until at least one job is saved.
- Never invent that a company or role is on the CV unless it appears in the profile context or a successful update_cv result.

Other tools:
- publish_profile when they want to go live. Confirm first if their intent is ambiguous.
- find_matching_jobs when they want several open campaigns.
- match_job when they name one campaign or the message includes a job id. Always call it before saying they fit or do not fit.
- match_job returns have (current), expired, missing, unknownExpiry, and canApply. An expired required ticket is NOT current. If unknownExpiry, ask them to type the date or attach a clearer photo.
- After match_job, if canApply is false, do not offer apply. Tell them which tickets are expired or missing. If canApply is true, show the draft and wait for a clear yes.
- apply_job sends CV + certificates to the listing desk (${CONTACT_EMAIL} until a company gives an address). It refuses when required tickets are expired or missing. Never invent a company email. Never send without confirmed=true. If already_applied, do not send again.
- For other email: draft to/subject/body first, then call send_email only after they clearly confirm. Set confirmed=true only after explicit approval.
- If they ask to send their CV, set attach_cv=true. The tool attaches a PDF of the current profile. Never write that a CV is attached unless send_email returns attached filenames.
- If pending_inbound.status is pending, an employer emailed the diver. Summarize it if they ask what is new.
- If pending_inbound.intent is certificates and they confirm (yes, send them, go ahead), you MUST call send_email to pending_inbound.from with attach_certificates=true and confirmed=true. Do not ask them to retype the recipient. Write a short professional body in the diver's voice.
- If they ask when a ticket expires, or say expiry is missing, call inspect_certificates with apply=true. That reads PDFs and JPEG/PNG photos. Do not say "not provided" if a stored scan has a date. If unreadable is true, ask the diver to type the date.
- If they ask to send certificates, set attach_certificates=true. The tool bakes every stored certificate PDF and photo (JPG/PNG) into one Certificates PDF. Never write that certificates are attached unless send_email returns attached filenames.
- If pending_inbound.status is sent, do not send again unless they explicitly ask to resend.
- Do not put "please find my CV attached" in a draft unless you will call send_email with attach_cv=true.
- Emails are sent as the logged-in diver. Reply-To is the inbound Hermes mailbox so employer replies come back here. Never invent a different sender.
- If email_capability.configured is false, explain that outbound email is not configured yet — do not pretend you sent mail.
- If profile_status is draft, preview at /preview (ambassador) and /preview/cv (full CV). Do NOT send them to /{username} until published — that URL returns 404 in draft.
- If profile_status is published, the public ambassador URL is /{username}.
- Never invent certifications, roles, or hours that are not in the profile context or the diver's latest message.

Current profile context (source of truth):
${JSON.stringify(context, null, 2)}`;
}

function describeToolFailure(error: unknown): string {
  if (error instanceof z.ZodError) return formatProfileZodError(error);
  if (error instanceof Error) return error.message;
  return String(error);
}

function outputLooksFailed(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const record = output as { ok?: unknown; error?: unknown; errors?: unknown; message?: unknown };
  if (record.ok !== false) return null;
  const parts: string[] = [];
  if (typeof record.error === "string" && record.error.trim()) parts.push(record.error);
  if (Array.isArray(record.errors)) {
    parts.push(record.errors.filter((item): item is string => typeof item === "string" && item.trim().length > 0).join("; "));
  }
  if (typeof record.message === "string" && record.message.trim()) parts.push(record.message);
  return parts.filter(Boolean).join(" ") || "update failed";
}

function collectToolFailures(result: {
  steps?: Array<{
    toolCalls?: Array<{ toolName?: string; invalid?: boolean; error?: unknown }>;
    toolResults?: Array<{ toolName?: string; output?: unknown }>;
    content?: Array<{ type?: string; toolName?: string; error?: unknown; output?: unknown }>;
  }>;
}): string[] {
  const failures: string[] = [];
  for (const step of result.steps ?? []) {
    for (const call of step.toolCalls ?? []) {
      if (call.invalid || call.error) {
        failures.push(`${call.toolName ?? "tool"}: ${describeToolFailure(call.error ?? "invalid tool input")}`);
      }
    }
    for (const toolResult of step.toolResults ?? []) {
      const failed = outputLooksFailed(toolResult.output);
      if (failed) failures.push(`${toolResult.toolName ?? "tool"}: ${failed}`);
    }
    for (const part of step.content ?? []) {
      if (part.type === "tool-error") {
        failures.push(`${part.toolName ?? "tool"}: ${describeToolFailure(part.error)}`);
      }
      if (part.type === "tool-result") {
        const failed = outputLooksFailed(part.output);
        if (failed) failures.push(`${part.toolName ?? "tool"}: ${failed}`);
      }
    }
  }
  return [...new Set(failures)];
}

function replyClaimsUnsavedCvChange(text: string) {
  const lower = text.toLowerCase();
  const mentionsPreview = lower.includes("/preview/cv");
  const claimsSaved =
    /\b(i('ve| have)?|we)\s+(saved|added|updated|processed)\b/i.test(text) ||
    /\b(saved|added|updated)\b.{0,40}\b(cv|job|role|experience)\b/i.test(text) ||
    /\b(cv|job|role)\b.{0,40}\b(saved|added|updated)\b/i.test(text) ||
    /processed your request/i.test(text);
  return claimsSaved || (mentionsPreview && /\b(added|updated|latest|saved)\b/i.test(text));
}

function shouldAttachCv(input: {
  attachCv?: boolean;
  attachCertificates?: boolean;
  subject: string;
  body: string;
}) {
  if (input.attachCv === true) return true;
  if (input.attachCertificates) return false;
  const blob = `${input.subject}\n${input.body}`;
  const mentionsCv = /\b(cv|curriculum vitae)\b/i.test(blob);
  const mentionsCerts = /\bcertificates?\b/i.test(blob);
  const claimsAttached = /\b(attached|attachment)\b/i.test(blob);
  if (mentionsCerts && !mentionsCv) return false;
  if (input.attachCv === false && !mentionsCv && !claimsAttached) return false;
  return mentionsCv || claimsAttached;
}

function shouldAttachCertificates(input: {
  attachCertificates?: boolean;
  to: string;
  subject: string;
  body: string;
  pendingInbound?: PendingInbound | null;
}) {
  if (input.attachCertificates === true) return true;
  const pending = input.pendingInbound;
  if (
    pending?.status === "pending" &&
    pending.intent === "certificates" &&
    pending.from === input.to.trim().toLowerCase()
  ) {
    return true;
  }
  const blob = `${input.subject}\n${input.body}`;
  return /\bcertificates?\b/i.test(blob) && /\b(attached|attachment)\b/i.test(blob);
}

function buildHermesReply(input: {
  text: string;
  cvUpdated: boolean;
  updatedParts: string[];
  toolFailures: string[];
  emailSent: boolean;
  emailAttached: string[];
}) {
  const text = input.text.trim();
  if (input.emailSent) {
    const names = input.emailAttached;
    if (names.length === 0) {
      if (/\b(attached|attachment)\b/i.test(text)) {
        return "I sent the email, but I could not attach a CV file. Ask me to send it again and I will include the PDF.";
      }
      return text || "Sent. No file was attached.";
    }
    if (text) {
      return /\b(attached|attachment)\b/i.test(text) ? text : `${text}\n\nAttached: ${names.join(", ")}.`;
    }
    return `Sent, with ${names.join(", ")} attached.`;
  }

  if (input.cvUpdated) {
    return (
      text ||
      `I've saved the CV update (${input.updatedParts.join(", ") || "profile"}). You can preview it at /preview/cv.`
    );
  }

  const failureDetail = input.toolFailures.slice(0, 3).join(" ");
  if (failureDetail && (!text || replyClaimsUnsavedCvChange(text))) {
    return `I could not save that CV change yet (${failureDetail}). Include the company, a role title, dates, and a short description, and I will try again.`;
  }
  if (!text) {
    return "I didn't change your CV yet. Tell me the company, role title, dates, and a short job description, and I'll add it.";
  }
  if (replyClaimsUnsavedCvChange(text)) {
    return failureDetail
      ? `I could not save that CV change yet (${failureDetail}). Include the company, a role title, dates, and a short description, and I will try again.`
      : "I haven't saved a CV change yet. The preview still shows your current profile. Tell me the company, role title, dates, and a short description and I'll add the job.";
  }
  return text;
}

function toModelMessages(history: HermesChatMessage[] | undefined, message: string): ModelMessage[] {
  const prior = (history ?? [])
    .filter((item) => item.content.trim())
    .slice(-20)
    .map(
      (item): ModelMessage =>
        item.role === "user"
          ? { role: "user", content: item.content }
          : { role: "assistant", content: item.content },
    );

  return [...prior, { role: "user", content: message }];
}

async function sendDiverFollowUpEmail(input: {
  supabase: SupabaseClient;
  diverId: string;
  username: string | null;
  displayName: string;
  userEmail: string;
  profile: DiverProfileFull;
  to: string;
  subject: string;
  body: string;
  attachCv?: boolean;
  attachCertificates?: boolean;
  pendingInbound?: PendingInbound | null;
}) {
  const attachments: EmailAttachment[] = [];
  const attachCertificates = shouldAttachCertificates({
    attachCertificates: input.attachCertificates,
    to: input.to,
    subject: input.subject,
    body: input.body,
    pendingInbound: input.pendingInbound,
  });
  const attachCv = shouldAttachCv({
    attachCv: input.attachCv,
    attachCertificates,
    subject: input.subject,
    body: input.body,
  });

  if (attachCv) {
    const filename = cvPdfFilename(input.displayName);
    const content = buildDiverCvPdf(input.profile, input.displayName);
    if (content.length < 100 || !content.subarray(0, 5).toString("utf8").startsWith("%PDF")) {
      return { ok: false as const, error: "Could not build a CV PDF to attach.", attachCv, attachCertificates };
    }
    attachments.push({ filename, content, contentType: "application/pdf" });
  }

  if (attachCertificates) {
    const certs = await buildCertificateAttachments(input.supabase, {
      diverId: input.diverId,
      displayName: input.displayName,
      profile: input.profile,
    });
    if (certs.length === 0) {
      return {
        ok: false as const,
        error:
          "No certificate files or certification records are on file to attach. Upload certificates in the workspace first.",
        attachCv,
        attachCertificates,
      };
    }
    attachments.push(...certs);
  }

  let outgoingBody = input.body;
  if (attachCv && input.username && !outgoingBody.includes(`/${input.username}`)) {
    outgoingBody = `${outgoingBody.trim()}\n\nOnline CV: https://doneunder.ai/cv/${input.username}`;
  }

  const result = await sendEmailAsLoggedInUser({
    userEmail: input.userEmail,
    userDisplayName: input.displayName,
    username: input.username,
    userId: input.diverId,
    to: input.to,
    subject: input.subject,
    body: outgoingBody,
    attachments,
  });

  await logAgentInteraction({
    actorId: input.diverId,
    feature: "hermes_send_email",
    input: {
      to: input.to,
      subject: input.subject,
      bodyLength: outgoingBody.length,
      attachCv,
      attachCertificates,
      attached: result.ok ? result.attached : [],
    },
    output: result,
  });

  if (!result.ok) {
    return { ...result, attachCv, attachCertificates };
  }
  return { ...result, attachCv, attachCertificates, body: outgoingBody };
}

export async function runHermesDiverTurn(input: HermesDiverTurnInput): Promise<HermesDiverTurnResult> {
  let profile = await getDiverProfile(input.supabase, input.diverId);
  try {
    profile = await persistMissingChildRowsFromJson(input.supabase, input.diverId);
  } catch (error) {
    console.error("Failed to restore CV rows from polished JSON:", error);
  }
  const suggestions: JobSuggestion[] = [];

  if (isInboundFollowUpDecline(input.message, input.pendingInbound ?? null)) {
    return {
      reply: "Understood — I will not send anything to them unless you ask later.",
      suggestions,
      profile,
      cvUpdated: false,
      updatedParts: [],
      pendingInboundStatus: "declined",
    };
  }

  if (
    isInboundFollowUpConfirmation(input.message, input.pendingInbound ?? null) &&
    input.pendingInbound?.intent === "certificates"
  ) {
    if (!input.userEmail) {
      return {
        reply: "I can see the request, but your account has no email address on file so I cannot send certificates yet.",
        suggestions,
        profile,
        cvUpdated: false,
        updatedParts: [],
      };
    }
    const pending = input.pendingInbound;
    const result = await sendDiverFollowUpEmail({
      supabase: input.supabase,
      diverId: input.diverId,
      username: input.username,
      displayName: input.displayName,
      userEmail: input.userEmail,
      profile,
      to: pending.from,
      subject: pending.subject.toLowerCase().startsWith("re:")
        ? pending.subject
        : `Re: ${pending.subject}`,
      body: `Hello,\n\nThank you for your interest. Please find my certificates attached.\n\nKind regards,\n${input.displayName}`,
      attachCertificates: true,
      pendingInbound: pending,
    });
    if (!result.ok) {
      return {
        reply: `I could not send the certificates yet (${result.error}).`,
        suggestions,
        profile,
        cvUpdated: false,
        updatedParts: [],
      };
    }
    const attached = result.attached.length > 0 ? ` Attached: ${result.attached.join(", ")}.` : "";
    return {
      reply: `I sent your certificates to ${pending.from} from your address.${attached}`,
      suggestions,
      profile,
      cvUpdated: false,
      updatedParts: [],
      pendingInboundStatus: "sent",
    };
  }

  if (!isAiConfigured()) {
    return {
      reply:
        "Hermes AI is not configured yet (missing XAI_API_KEY). You can still attach a CV PDF in this chat, but I cannot update your profile by talking until the AI key is enabled.",
      suggestions,
      profile,
      cvUpdated: false,
      updatedParts: [],
    };
  }

  const context = buildProfileContext(
    profile,
    input.username,
    input.displayName,
    input.userEmail,
    input.pendingInbound,
  );
  const system = buildSystemPrompt(context);

  const state = {
    profile,
    suggestions,
    cvUpdated: false,
    updatedParts: [] as string[],
    emailSent: false,
    emailAttached: [] as string[],
    pendingInboundStatus: undefined as PendingInboundStatus | undefined,
  };

  const tools = {
    update_cv: tool({
      description:
        "Save CV and profile changes from the conversation. Use this for headline, bio, hours, location, availability, jobs/experience, certifications, and references. Write all stored text in English.",
      inputSchema: conversationalCvUpdateSchema,
      execute: async (patch) => {
        try {
          const result = await applyConversationalCvUpdate(input.supabase, input.diverId, patch, {
            sourceRef: "source: web-chat",
          });
          if (result.ok) {
            state.profile = result.profile;
            state.cvUpdated = true;
            for (const part of result.changed) {
              if (!state.updatedParts.includes(part)) state.updatedParts.push(part);
            }
          }
          return {
            ok: result.ok,
            changed: result.changed,
            errors: result.errors,
            profile_status: result.profile.profile.profile_status,
            sat_hours: result.profile.profile.sat_hours,
            dive_hours: result.profile.profile.dive_hours,
            experience_count: result.profile.experiences.length,
            certification_count: result.profile.certifications.length,
            companies: result.profile.experiences.slice(0, 8).map((item) => item.company),
            preview_cv_path: result.ok ? "/preview/cv" : undefined,
          };
        } catch (error) {
          return {
            ok: false,
            error: describeToolFailure(error),
          };
        }
      },
    }),
    publish_profile: tool({
      description: "Publish the diver ambassador page when they want to go live.",
      inputSchema: z.object({
        confirmed: z.boolean().describe("True when the diver clearly wants to publish now."),
      }),
      execute: async ({ confirmed }) => {
        if (!confirmed) {
          return { ok: false, message: "Publish not confirmed." };
        }
        const result = await publishDiverProfile(input.supabase, input.diverId);
        state.profile = result.profile;
        if (!result.ok) {
          return {
            ok: false,
            errors: result.validation.errors,
            warnings: result.validation.warnings,
          };
        }
        return {
          ok: true,
          profile_status: result.profile.profile.profile_status,
          public_path: input.username ? `/${input.username}` : null,
          preview_path: "/preview",
        };
      },
    }),
    inspect_certificates: tool({
      description:
        "Read stored certificate PDFs and photos (JPEG/PNG). Extract ticket name, issue date, and expiry. Use this when the diver asks about expiry dates or a ticket shows expiry missing.",
      inputSchema: z.object({
        apply: z
          .boolean()
          .optional()
          .describe("If true, save any extracted expiry/issue dates onto matching certifications."),
      }),
      execute: async ({ apply }) => {
        const files = listCertificateDocumentFiles(
          await listDiverDocumentFiles(input.supabase, input.diverId),
        );
        const fromFiles = [];
        for (const file of files) {
          const { data, error } = await input.supabase.storage
            .from(DIVER_DOCUMENTS_BUCKET)
            .download(file.path);
          if (error || !data) {
            fromFiles.push({ file: file.name, issue_date: null, expiry_date: null, note: "download failed" });
            continue;
          }
          const bytes = Buffer.from(await data.arrayBuffer());
          const read = await readCertificateBytes(bytes, file.name);
          fromFiles.push({
            file: file.name,
            name: read.name,
            issue_date: read.issue_date,
            expiry_date: read.expiry_date,
            source: read.source,
            unreadable: read.unreadable,
            excerpt: read.excerpt,
          });
          if (apply && (read.expiry_date || read.issue_date || read.name)) {
            const result = await applyCertificateRead(input.supabase, input.diverId, read, file.name);
            if (result.ok) {
              state.profile = await getDiverProfile(input.supabase, input.diverId);
              state.cvUpdated = true;
              if (!state.updatedParts.includes("certifications")) state.updatedParts.push("certifications");
            }
          }
        }
        return {
          on_profile: state.profile.certifications.map((cert) => ({
            name: cert.name,
            issue_date: cert.issue_date ?? null,
            expiry_date: cert.expiry_date ?? null,
          })),
          from_files: fromFiles,
        };
      },
    }),
    find_matching_jobs: tool({
      description: "Find open jobs that match the diver certifications and location.",
      inputSchema: z.object({}),
      execute: async () => {
        const openJobs = await loadOpenJobs(input.supabase);
        state.suggestions = scoreJobsForDiver(openJobs, state.profile);
        return {
          count: state.suggestions.length,
          suggestions: state.suggestions,
        };
      },
    }),
    match_job: tool({
      description:
        "Score the logged-in diver against one campaign. Use when they click Match in Hermes or name a listing.",
      inputSchema: z.object({
        job_id: z.string().describe("Public job id from the jobs board"),
      }),
      execute: async ({ job_id: jobId }) => {
        const openJobs = await loadOpenJobs(input.supabase);
        const job = openJobs.find((item) => item.id === jobId) ?? findCatalogJob(jobId);
        if (!job) {
          return { ok: false, error: "That campaign is not on the board." };
        }
        const match = matchProfileToJob(job, state.profile);
        state.suggestions = [
          {
            id: job.id,
            title: job.title,
            location: job.location,
            reason: formatMatchReason(match),
            score: match.score,
          },
        ];
        return {
          ok: true,
          job: {
            id: job.id,
            title: job.title,
            location: job.location,
            scope: job.scope,
            startDate: job.startDate,
            closesAt: job.closesAt,
            requiredCerts: job.requiredCerts,
            open: match.open,
          },
          match,
          apply: applicationDraft(job, input.displayName),
        };
      },
    }),
    apply_job: tool({
      description:
        "Apply the diver to one campaign after they confirm. Sends the living CV and certificate pack to the listing desk. Refuses when required tickets are expired or missing. Never send without confirmed=true.",
      inputSchema: z.object({
        job_id: z.string(),
        confirmed: z.boolean().describe("True only after the diver approved this application."),
      }),
      execute: async ({ job_id: jobId, confirmed }) => {
        const openJobs = await loadOpenJobs(input.supabase);
        const job = openJobs.find((item) => item.id === jobId) ?? findCatalogJob(jobId);
        if (!job) {
          return { ok: false, error: "That campaign is not on the board." };
        }
        const draft = applicationDraft(job, input.displayName);
        const match = matchProfileToJob(job, state.profile);
        const blocked = applyBlockReason(match);
        if (blocked) {
          return { ok: false, error: blocked, match, draft };
        }
        if (!confirmed) {
          return {
            ok: false,
            message: "Not sent. Show the draft and wait for a clear yes.",
            match,
            draft,
          };
        }
        if (!isJobOpen(job)) {
          return { ok: false, error: "This campaign has closed.", draft };
        }
        if (!input.userEmail) {
          return { ok: false, error: "Logged-in account has no email address on file.", draft };
        }

        const { data: prior } = await input.supabase
          .from("ai_interactions")
          .select("id, input, output")
          .eq("actor_id", input.diverId)
          .eq("feature", "hermes_apply_job")
          .order("created_at", { ascending: false })
          .limit(30);
        const already = (prior ?? []).some((row) => {
          try {
            const parsed = typeof row.input === "string" ? JSON.parse(row.input) : row.input;
            return parsed && typeof parsed === "object" && (parsed as { jobId?: string }).jobId === job.id;
          } catch {
            return false;
          }
        });
        if (already) {
          return { ok: false, already_applied: true, error: "Already applied to this campaign.", draft };
        }

        const result = await sendDiverFollowUpEmail({
          supabase: input.supabase,
          diverId: input.diverId,
          username: input.username,
          displayName: input.displayName,
          userEmail: input.userEmail,
          profile: state.profile,
          to: draft.to,
          subject: draft.subject,
          body: draft.body,
          attachCv: true,
          attachCertificates: true,
          pendingInbound: input.pendingInbound ?? null,
        });

        await logAgentInteraction({
          actorId: input.diverId,
          feature: "hermes_apply_job",
          input: { jobId: job.id, title: job.title, to: draft.to },
          output: result,
        });

        if (!result.ok) {
          return { ok: false, error: result.error, draft };
        }
        return {
          ok: true,
          to: draft.to,
          from: result.from,
          attached: result.attached,
          jobId: job.id,
          title: job.title,
        };
      },
    }),
    send_email: tool({
      description:
        "Send an email as the logged-in diver after they confirm recipient, subject, and body. Set attach_cv=true when sending a CV. Set attach_certificates=true to attach one combined Certificates PDF (all stored PDFs and photos). Never send without confirmed=true.",
      inputSchema: z.object({
        to: z.string().email().describe("Recipient email address"),
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(8000).describe("Plain-text email body in English, written in the diver's voice"),
        attach_cv: z
          .boolean()
          .optional()
          .describe("True when the diver wants their CV attached. Required for 'send my CV' requests."),
        attach_certificates: z
          .boolean()
          .optional()
          .describe("True when the diver wants certificates attached as one combined PDF pack."),
        confirmed: z
          .boolean()
          .describe("True only after the diver explicitly approved sending this exact email."),
      }),
      execute: async ({ to, subject, body, attach_cv: attachCv, attach_certificates: attachCertificates, confirmed }) => {
        if (!confirmed) {
          return {
            ok: false,
            message: "Not sent. Show the draft and wait for the diver to confirm before calling again with confirmed=true.",
            draft: {
              to,
              subject,
              body,
              attach_cv: shouldAttachCv({ attachCv, attachCertificates, subject, body }),
              attach_certificates: shouldAttachCertificates({
                attachCertificates,
                to,
                subject,
                body,
                pendingInbound: input.pendingInbound ?? null,
              }),
            },
          };
        }

        if (!input.userEmail) {
          return { ok: false, error: "Logged-in account has no email address on file." };
        }

        try {
          const result = await sendDiverFollowUpEmail({
            supabase: input.supabase,
            diverId: input.diverId,
            username: input.username,
            displayName: input.displayName,
            userEmail: input.userEmail,
            profile: state.profile,
            to,
            subject,
            body,
            attachCv,
            attachCertificates,
            pendingInbound: input.pendingInbound ?? null,
          });

          if (!result.ok) {
            return { ok: false, error: result.error };
          }

          state.emailSent = true;
          state.emailAttached = result.attached;
          if (
            input.pendingInbound?.status === "pending" &&
            parseEmailAddress(to) === input.pendingInbound.from
          ) {
            state.pendingInboundStatus = "sent";
          }

          return {
            ok: true,
            id: result.id,
            from: result.from,
            replyTo: result.replyTo,
            to,
            subject,
            attached: result.attached,
          };
        } catch (error) {
          return { ok: false, error: describeToolFailure(error) };
        }
      },
    }),
  };

  const result = await generateText({
    model: aiModel,
    system,
    messages: toModelMessages(input.history, input.message),
    tools,
    stopWhen: stepCountIs(8),
  });

  const toolFailures = collectToolFailures(result);
  const reply = buildHermesReply({
    text: result.text,
    cvUpdated: state.cvUpdated,
    updatedParts: state.updatedParts,
    toolFailures,
    emailSent: state.emailSent,
    emailAttached: state.emailAttached,
  });

  return {
    reply,
    suggestions: state.suggestions,
    profile: state.profile,
    cvUpdated: state.cvUpdated,
    updatedParts: state.updatedParts,
    pendingInboundStatus: state.pendingInboundStatus,
  };
}
