import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { aiModel, ENGLISH_ONLY_INSTRUCTION } from "@/lib/ai";
import {
  applyConversationalCvUpdate,
  getDiverProfile,
  persistMissingChildRowsFromJson,
  publishDiverProfile,
  unpublishDiverProfile,
  validateDiverProfile,
} from "@/lib/diver-profile-service";
import { conversationalCvUpdateSchema, formatProfileZodError, type DiverProfileFull } from "@/lib/diver-profile";
import { sendEmailAsLoggedInUser, inboundReplyToAddress, parseEmailAddress, type EmailAttachment } from "@/lib/email";
import { buildDiverCvPdf, cvPdfFilename, livingCvDisplayName } from "@/lib/cv-pdf";
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
  formatMatchReason,
  isJobOpen,
  loadAppliedJobIds,
  loadOpenJobs,
  resolveJobRef,
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
import { canUseSchoolOutreach } from "@/lib/school-outreach-access";
import {
  addSchoolOutreachTarget,
  listSchoolOutreachTargets,
  logSchoolOutreachContact,
  summarizeSchoolOutreach,
  updateSchoolOutreachTarget,
  type SchoolContactChannel,
  type SchoolOutreachStatus,
} from "@/lib/school-outreach";
import {
  addDivingCompany,
  companyApplicationDraft,
  formatCompanyMatchReason,
  getDivingCompanyByRef,
  listDivingCompanies,
  scoreDiverAgainstCompany,
  updateDivingCompany,
  type DivingCompanyScope,
} from "@/lib/diving-companies";

export type JobSuggestion = {
  id: string;
  title: string;
  location: string;
  reason: string;
  score: number;
  applied?: boolean;
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
  needsPhoto?: boolean;
  pendingInboundStatus?: PendingInboundStatus;
  appliedJobIds?: string[];
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

function scoreJobsForDiver(
  jobs: PublicJob[],
  profile: DiverProfileFull,
  appliedJobIds: Set<string> = new Set(),
): JobSuggestion[] {
  return jobs
    .map((job) => {
      const match = matchProfileToJob(job, profile);
      return {
        id: job.id,
        title: job.title,
        location: job.location,
        reason: formatMatchReason(match),
        score: match.score,
        applied: appliedJobIds.has(job.id),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

async function loadAppliedCompanyIds(supabase: SupabaseClient, diverId: string) {
  const { data } = await supabase
    .from("ai_interactions")
    .select("input")
    .eq("actor_id", diverId)
    .eq("feature", "hermes_apply_company")
    .order("created_at", { ascending: false })
    .limit(50);
  const ids = new Set<string>();
  for (const row of data ?? []) {
    try {
      const parsed = typeof row.input === "string" ? JSON.parse(row.input) : row.input;
      const companyId =
        parsed && typeof parsed === "object"
          ? (parsed as { companyId?: string }).companyId
          : null;
      if (companyId) ids.add(companyId);
    } catch {
      // Ignore malformed audit rows.
    }
  }
  return ids;
}

function matchProfileToCompany(
  company: Parameters<typeof scoreDiverAgainstCompany>[0],
  profile: DiverProfileFull,
) {
  return scoreDiverAgainstCompany(company, {
    certs: ticketsFromProfile(profile),
    location: profile.profile.location,
  });
}

function buildProfileContext(
  profile: DiverProfileFull,
  username: string | null,
  displayName: string,
  userEmail: string | null,
  pendingInbound?: PendingInbound | null,
  openJobs: PublicJob[] = [],
  hasPhoto = false,
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
      has_photo: hasPhoto,
      photo_upload_path: "/preview",
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
    open_campaigns: openJobs.map((job) => ({
      id: job.id,
      title: job.title,
      location: job.location,
      requiredCerts: job.requiredCerts,
    })),
  };
}

function buildSchoolOutreachSystemAddon(
  summary: Awaited<ReturnType<typeof summarizeSchoolOutreach>>,
) {
  const next = summary.nextTodo
    .map((t) => `${t.slug} — ${t.name} (P${t.priority}${t.country ? `, ${t.country}` : ""})`)
    .join("\n");
  return `

School outreach ops (DoneUnder partnerships — separate from diver CV work):
- Gareth is building relationships with commercial diving schools so graduates can upload tickets and publish on DoneUnder.
- Use list_school_targets when he asks who to contact, what's left, or for a pipeline summary.
- When he reports an email sent, call made, or meeting, call log_school_contact with the school slug or name, channel, and a one-line summary. Default status becomes contacted unless he says they replied (use set_status=replied) or partnership (partner).
- Use update_school_target to fix contact person/email, notes, website, priority, or status without a new contact log.
- Use add_school_target if a school is missing from the list.
- Help draft outreach emails in chat; if he sends via send_email to a school contact, then log_school_contact in the same turn when he confirms it went out.

Pipeline counts: ${JSON.stringify(summary.byStatus)} active targets=${summary.totalActive}
Next todo (up to 8):
${next || "(none — check list_school_targets)"}
`;
}

function buildSystemPrompt(
  context: ReturnType<typeof buildProfileContext>,
  schoolOutreachAddon?: string,
) {
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
- If they paste or attach text/documents in another language, translate into English before saving. Confirm briefly that you translated.
- If the message starts with "Please fix this part of my CV:" and quotes a passage, treat that quote as the target. Call update_cv to correct that section. Do not rewrite unrelated parts unless they ask.
- Use add_* for new rows, update_* for existing rows (match by id, company, role, or certificate name), remove_* to delete, and replace_* only when they paste a full CV or clearly want a whole section rewritten.
- For a new job, always call update_cv with add_experiences. Put company, a short role_title (extract one from the job description if they did not label it), dates, and summary. Do not send them to re-upload a PDF when they already typed the job in chat.
- Write every stored field in English. Translate if needed; keep official certificate titles and proper names.
- After a successful update_cv (ok=true), briefly confirm what you saved and invite them to preview /preview/cv.
- If update_cv returns ok=false, tell them it was NOT saved and quote the error. Do not link /preview/cv as if the change is there.
- validation.warnings (for example missing cert expiry dates) do NOT block adding a job. Only a failed update_cv call blocks a save.
- If the profile is empty (no headline, no experiences, no certifications), this is first-run. Invite them to attach a CV PDF and ticket photos (IMCA, BOSIET/FOET, medical) in this chat — any language is fine; you translate into English for the living CV. Do not send them to a form. Do not claim they fit a campaign until match_job has run against real tickets.
- If the profile already has a headline, experiences, or a stored CV, do NOT ask them to upload a CV again. Certificates can be added on their own; the existing CV stays.
- If counts.experiences is 0, the public CV currently shows "No project history has been added yet." That is the most important gap. Extract jobs from the diver's message, pasted CV text, or profile.polished markdown/json and call update_cv with add_experiences or replace_experiences. Do not say the CV is complete until at least one job is saved.
- Business card photo: if diver.has_photo is false, treat it as incomplete. Nudge them to add a clear face photo on /preview (Add photo). Remind when they ask what is missing, before publishing, after the CV looks ready, and especially right after publish. Be direct: no photo = weak page for contractors. You cannot upload the photo in chat — send them to /preview. If diver.has_photo is true, do not ask for another photo unless they want to change it.
- Never invent that a company or role is on the CV unless it appears in the profile context or a successful update_cv result.

Other tools:
- publish_profile when they want to go live. Confirm first if their intent is ambiguous.
- unpublish_profile when they want the public page taken down (keep account and username; /{username} returns 404 until they publish again). Confirm if intent is ambiguous.
- find_matching_jobs when they want several open campaigns.
- match_job when they name one campaign, say yes to one you just offered, or the message includes a job id. Always call it before saying they fit or do not fit.
- NEVER ask the diver to type a job ID. IDs are in open_campaigns. If they say "yes" after you offered the saturation role, call match_job with that campaign's id (title match is enough).
- match_job accepts a job id or a title fragment such as "saturation" or "German Bight".
- match_job returns have (current), expired, missing, unknownExpiry, and canApply. An expired required ticket is NOT current. If unknownExpiry, ask them to type the date or attach a clearer photo.
- After match_job, if canApply is false, do not offer apply. Tell them which tickets are expired or missing. If canApply is true, show the draft and wait for a clear yes.
- apply_job sends CV + certificates to the listing desk (${CONTACT_EMAIL} until a company gives an address). It refuses when required tickets are expired or missing. Never invent a company email. Never send without confirmed=true. If already_applied, do not send again.
- list_diving_companies when they ask about diving companies, who hires juniors/graduates, contractors in a country/region, or want work beyond the open campaign board. Prefer hire_graduates=true for fresh school graduates. Show soft fit % and typical tickets; still list weak fits.
- apply_to_company only when has_apply_email / canApply is true for that company (verified careers inbox on file). Warn about missing typical tickets but do NOT hard-block — grads may still send after a clear yes. Never invent a company email. Never send without confirmed=true. If already applied to that company, do not send again.
- If a company has no apply email, browse only: share website/notes and suggest building the CV / open campaigns; do not invent contacts.
- For other email: draft to/subject/body first, then call send_email only after they clearly confirm. Set confirmed=true only after explicit approval. Light markdown in the body (**bold**, bullet lists) is fine — DoneUnder renders it for the recipient. Do not leave raw HTML in the body.
- If they ask to send their CV, set attach_cv=true. The tool attaches a PDF of the current profile. Never write that a CV is attached unless send_email returns attached filenames.
- If pending_inbound.status is pending, an employer emailed the diver (often a reply to an application). Summarize it. That is how Hermes sees that a company is interested.
- If pending_inbound.intent is certificates and they confirm (yes, send them, go ahead), you MUST call send_email to pending_inbound.from with attach_certificates=true and confirmed=true. Do not ask them to retype the recipient. Write a short professional body in the diver's voice.
- If they ask when a ticket expires, or say expiry is missing, call inspect_certificates with apply=true. That reads PDFs and JPEG/PNG photos. Do not say "not provided" if a stored scan has a date. If unreadable is true, ask the diver to type the date.
- If they ask to send certificates, set attach_certificates=true. The tool bakes every stored certificate PDF and photo (JPG/PNG) into one Certificates PDF. Never write that certificates are attached unless send_email returns attached filenames.
- If pending_inbound.status is sent, do not send again unless they explicitly ask to resend.
- Do not put "please find my CV attached" in a draft unless you will call send_email with attach_cv=true.
- Emails are sent as the logged-in diver. Reply-To is the inbound Hermes mailbox so employer replies come back here. Never invent a different sender.
- If email_capability.configured is false, explain that outbound email is not configured yet — do not pretend you sent mail.
- If profile_status is draft, preview at /preview (ambassador) and /preview/cv (full CV). Do NOT send them to /{username} until published — that URL returns 404 in draft.
- If profile_status is draft and the CV already has a headline or processed content, end helpful turns by clearly offering to publish (one short line + ask them to confirm). Prefer publish_profile after they say yes. Do not wait for them to invent the word "publish" themselves when the pack looks ready.
- If profile_status is published, the public ambassador URL is /{username}.
- Before publish_profile, if diver.has_photo is false, warn that the public card looks unfinished without a photo — then publish if they still clearly want to go live.
- After publish_profile succeeds: if needs_photo is true (or diver.has_photo is false), your reply MUST lead with the photo CTA. Say the page is live but incomplete without a face photo, and tell them to open /preview now and add one. Do not treat publish as "all done" without the photo.
- Testers and non-divers who keep a username for demos should unpublish when they do not want a public page.
- Never invent certifications, roles, or hours that are not in the profile context or the diver's latest message.

Current profile context (source of truth):
${JSON.stringify(context, null, 2)}${schoolOutreachAddon ?? ""}`;
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

function collectToolFailures(result: { steps?: readonly unknown[] }): string[] {
  const failures: string[] = [];
  for (const rawStep of result.steps ?? []) {
    const step = rawStep as {
      toolCalls?: Array<{ toolName?: string; invalid?: boolean; error?: unknown }>;
      toolResults?: Array<{ toolName?: string; output?: unknown }>;
      content?: Array<{ type?: string; toolName?: string; error?: unknown; output?: unknown }>;
    };
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
  const displayName = livingCvDisplayName(input.profile, input.displayName);
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
    const filename = cvPdfFilename(displayName);
    const content = buildDiverCvPdf(input.profile, displayName);
    if (content.length < 100 || !content.subarray(0, 5).toString("utf8").startsWith("%PDF")) {
      return { ok: false as const, error: "Could not build a CV PDF to attach.", attachCv, attachCertificates };
    }
    attachments.push({ filename, content, contentType: "application/pdf" });
  }

  if (attachCertificates) {
    const certs = await buildCertificateAttachments(input.supabase, {
      diverId: input.diverId,
      displayName,
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
    userDisplayName: displayName,
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
  const appliedJobIds = await loadAppliedJobIds(input.supabase, input.diverId);
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

  const openJobs = await loadOpenJobs(input.supabase);
  const appliedCompanyIds = await loadAppliedCompanyIds(input.supabase, input.diverId);
  const { data: userPhotoRow } = await input.supabase
    .from("users")
    .select("avatar_url")
    .eq("id", input.diverId)
    .maybeSingle();
  const hasPhoto = Boolean(
    typeof userPhotoRow?.avatar_url === "string" && userPhotoRow.avatar_url.trim(),
  );
  const schoolOutreachEnabled = canUseSchoolOutreach(input.username, input.userEmail);
  const companyOpsEnabled = schoolOutreachEnabled;
  const schoolOutreachSummary = schoolOutreachEnabled
    ? await summarizeSchoolOutreach(input.supabase)
    : null;

  const context = buildProfileContext(
    profile,
    input.username,
    input.displayName,
    input.userEmail,
    input.pendingInbound,
    openJobs,
    hasPhoto,
  );
  const system = buildSystemPrompt(
    context,
    schoolOutreachSummary ? buildSchoolOutreachSystemAddon(schoolOutreachSummary) : undefined,
  );

  const state = {
    profile,
    suggestions,
    cvUpdated: false,
    updatedParts: [] as string[],
    needsPhoto: false,
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
        const { data: photoRow } = await input.supabase
          .from("users")
          .select("avatar_url")
          .eq("id", input.diverId)
          .maybeSingle();
        const publishedHasPhoto = Boolean(
          typeof photoRow?.avatar_url === "string" && photoRow.avatar_url.trim(),
        );
        if (!publishedHasPhoto) state.needsPhoto = true;
        return {
          ok: true,
          profile_status: result.profile.profile.profile_status,
          public_path: input.username ? `/${input.username}` : null,
          preview_path: "/preview",
          needs_photo: !publishedHasPhoto,
          photo_upload_path: "/preview",
        };
      },
    }),
    unpublish_profile: tool({
      description:
        "Take the public ambassador page offline. Keeps the account, CV draft, and username. /{username} returns 404 until they publish again.",
      inputSchema: z.object({
        confirmed: z.boolean().describe("True when the diver clearly wants to unpublish now."),
      }),
      execute: async ({ confirmed }) => {
        if (!confirmed) {
          return { ok: false, message: "Unpublish not confirmed." };
        }
        const result = await unpublishDiverProfile(input.supabase, input.diverId);
        state.profile = result.profile;
        if (!result.ok) {
          return { ok: false, error: result.error };
        }
        return {
          ok: true,
          profile_status: result.profile.profile.profile_status,
          already_draft: result.already_draft,
          preview_path: "/preview",
          public_path: input.username ? `/${input.username}` : null,
          note: "Public page is offline. Username is kept. Preview still works at /preview.",
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
        state.suggestions = scoreJobsForDiver(openJobs, state.profile, appliedJobIds);
        return {
          count: state.suggestions.length,
          suggestions: state.suggestions,
        };
      },
    }),
    match_job: tool({
      description:
        "Score the logged-in diver against one campaign. Use when they click Match, name a listing, or say yes to a campaign you just offered. job_id may be an id or a title fragment (saturation, German Bight).",
      inputSchema: z.object({
        job_id: z.string().describe("Public job id, or a title fragment such as saturation"),
      }),
      execute: async ({ job_id: jobId }) => {
        const openJobs = await loadOpenJobs(input.supabase);
        const job = resolveJobRef(openJobs, jobId);
        if (!job) {
          return {
            ok: false,
            error: "I could not tell which campaign. Name the title from the list — do not ask the diver for an id.",
            campaigns: openJobs.map((item) => ({ id: item.id, title: item.title })),
          };
        }
        const match = matchProfileToJob(job, state.profile);
        state.suggestions = [
          {
            id: job.id,
            title: job.title,
            location: job.location,
            reason: formatMatchReason(match),
            score: match.score,
            applied: appliedJobIds.has(job.id),
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
          apply: applicationDraft(job, livingCvDisplayName(state.profile, input.displayName)),
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
        const job = resolveJobRef(openJobs, jobId);
        if (!job) {
          return {
            ok: false,
            error: "I could not tell which campaign. Name the title from the list — do not ask the diver for an id.",
            campaigns: openJobs.map((item) => ({ id: item.id, title: item.title })),
          };
        }
        const draft = applicationDraft(job, livingCvDisplayName(state.profile, input.displayName));
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
          displayName: livingCvDisplayName(state.profile, input.displayName),
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
        appliedJobIds.add(job.id);
        state.suggestions = state.suggestions.map((item) =>
          item.id === job.id ? { ...item, applied: true } : item,
        );
        return {
          ok: true,
          to: draft.to,
          from: result.from,
          attached: result.attached,
          jobId: job.id,
          title: job.title,
          applied: true,
        };
      },
    }),
    list_diving_companies: tool({
      description:
        "Browse the curated diving-company directory. Use for graduates and divers asking who hires, contractors by country/region, or work beyond open campaigns. Prefer hire_graduates=true for fresh school leavers.",
      inputSchema: z.object({
        country: z.string().optional().describe("Country filter, e.g. UK, Norway, Netherlands"),
        scope: z.enum(["offshore", "inshore"]).optional(),
        hire_graduates: z
          .boolean()
          .optional()
          .describe("True to prefer companies that take junior / graduate divers"),
        search: z.string().optional().describe("Search name, country, location, or notes"),
        has_apply_email: z
          .boolean()
          .optional()
          .describe("True only lists companies with a verified careers inbox"),
      }),
      execute: async ({ country, scope, hire_graduates, search, has_apply_email }) => {
        const companies = await listDivingCompanies(input.supabase, {
          country,
          scope: scope as DivingCompanyScope | undefined,
          hire_graduates,
          search,
          has_apply_email,
          limit: 25,
        });
        const ranked = companies
          .map((company) => {
            const match = matchProfileToCompany(company, state.profile);
            return {
              slug: company.slug,
              name: company.name,
              country: company.country,
              location: company.location,
              website: company.website,
              scopes: company.scopes,
              typical_certs: company.typical_certs,
              notes: company.notes,
              hire_graduates: company.hire_graduates,
              has_apply_email: Boolean(company.apply_email?.trim()),
              score: match.score,
              verdict: match.verdict,
              reason: formatCompanyMatchReason(match),
              applied: appliedCompanyIds.has(company.id),
            };
          })
          .sort((a, b) => b.score - a.score);
        return { ok: true, count: ranked.length, companies: ranked };
      },
    }),
    apply_to_company: tool({
      description:
        "Apply the diver to a curated diving company after they confirm. Sends living CV + certificate pack to the company's verified apply_email only. Soft-warns on missing typical tickets but does not hard-block. Never invent an email. Never send without confirmed=true.",
      inputSchema: z.object({
        company: z.string().describe("Company slug or distinctive name fragment"),
        confirmed: z.boolean().describe("True only after the diver approved this application."),
      }),
      execute: async ({ company: companyRef, confirmed }) => {
        const company = await getDivingCompanyByRef(input.supabase, companyRef);
        if (!company || company.status === "skip") {
          return {
            ok: false,
            error: "I could not tell which company. Name it from the directory list.",
          };
        }
        const match = matchProfileToCompany(company, state.profile);
        if (!match.canApply || !company.apply_email?.trim()) {
          return {
            ok: false,
            error:
              "This company has no verified apply email yet — browse only. Share the website/notes; do not invent a contact.",
            company: {
              slug: company.slug,
              name: company.name,
              website: company.website,
              notes: company.notes,
            },
            match,
          };
        }

        const draft = companyApplicationDraft(
          company,
          livingCvDisplayName(state.profile, input.displayName),
        );
        const warnings: string[] = [];
        if (match.missing.length) {
          warnings.push(`Typical tickets missing: ${match.missing.join(", ")}`);
        }
        if (match.expired.length) {
          warnings.push(`Typical tickets expired: ${match.expired.join(", ")}`);
        }

        if (!confirmed) {
          return {
            ok: false,
            message: "Not sent. Show the draft (and any ticket warnings) and wait for a clear yes.",
            match,
            warnings,
            draft,
          };
        }
        if (!input.userEmail) {
          return { ok: false, error: "Logged-in account has no email address on file.", draft };
        }
        if (appliedCompanyIds.has(company.id)) {
          return {
            ok: false,
            already_applied: true,
            error: "Already applied to this company.",
            draft,
          };
        }

        const result = await sendDiverFollowUpEmail({
          supabase: input.supabase,
          diverId: input.diverId,
          username: input.username,
          displayName: livingCvDisplayName(state.profile, input.displayName),
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
          feature: "hermes_apply_company",
          input: {
            companyId: company.id,
            slug: company.slug,
            name: company.name,
            to: draft.to,
          },
          output: result,
        });

        if (!result.ok) {
          return { ok: false, error: result.error, draft, warnings };
        }
        appliedCompanyIds.add(company.id);
        return {
          ok: true,
          to: draft.to,
          from: result.from,
          attached: result.attached,
          companyId: company.id,
          slug: company.slug,
          name: company.name,
          warnings,
          applied: true,
        };
      },
    }),
    ...(companyOpsEnabled
      ? {
          add_diving_company: tool({
            description:
              "Ops only: add a diving company to the curated directory. Set apply_email only when the careers inbox is verified.",
            inputSchema: z.object({
              name: z.string().min(2),
              slug: z.string().optional(),
              country: z.string().optional(),
              location: z.string().optional(),
              website: z.string().url().optional(),
              scopes: z.array(z.enum(["offshore", "inshore"])).optional(),
              typical_certs: z.array(z.string()).optional(),
              notes: z.string().optional(),
              hire_graduates: z.boolean().optional(),
              apply_email: z.string().email().optional(),
            }),
            execute: async (payload) => {
              return addDivingCompany(input.supabase, payload);
            },
          }),
          update_diving_company: tool({
            description:
              "Ops only: update a diving company (including setting a verified apply_email). Never invent emails.",
            inputSchema: z.object({
              company: z.string().describe("Company slug or name fragment"),
              status: z.enum(["active", "skip"]).optional(),
              name: z.string().optional(),
              country: z.string().nullable().optional(),
              location: z.string().nullable().optional(),
              website: z.string().url().nullable().optional(),
              scopes: z.array(z.enum(["offshore", "inshore"])).optional(),
              typical_certs: z.array(z.string()).optional(),
              notes: z.string().nullable().optional(),
              hire_graduates: z.boolean().optional(),
              apply_email: z.string().email().nullable().optional(),
            }),
            execute: async ({ company, ...patch }) => {
              const result = await updateDivingCompany(input.supabase, company, patch);
              if (!result.ok) return result;
              return {
                ok: true,
                company: {
                  slug: result.company.slug,
                  name: result.company.name,
                  apply_email: result.company.apply_email,
                  hire_graduates: result.company.hire_graduates,
                  status: result.company.status,
                },
              };
            },
          }),
        }
      : {}),
    send_email: tool({
      description:
        "Send an email as the logged-in diver after they confirm recipient, subject, and body. Set attach_cv=true when sending a CV. Set attach_certificates=true to attach one combined Certificates PDF (all stored PDFs and photos). Never send without confirmed=true.",
      inputSchema: z.object({
        to: z.string().email().describe("Recipient email address"),
        subject: z.string().min(1).max(200),
        body: z
          .string()
          .min(1)
          .max(8000)
          .describe(
            "Email body in English, written in the diver's voice. Plain text or light markdown (**bold**, lists). Do not use raw HTML.",
          ),
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
    ...(schoolOutreachEnabled
      ? {
          list_school_targets: tool({
            description:
              "List commercial diving school outreach targets and their status (todo, contacted, replied, partner, skip).",
            inputSchema: z.object({
              status: z
                .enum(["todo", "contacted", "replied", "partner", "skip", "active"])
                .optional()
                .describe("Filter by status. active = exclude skip."),
              priority: z.number().int().min(0).max(6).optional(),
              search: z.string().optional().describe("Search name, slug, country, location."),
            }),
            execute: async ({ status, priority, search }) => {
              const targets = await listSchoolOutreachTargets(input.supabase, {
                status: status ?? "active",
                priority,
                search,
                limit: 40,
              });
              return {
                ok: true,
                count: targets.length,
                targets: targets.map((t) => ({
                  slug: t.slug,
                  name: t.name,
                  status: t.status,
                  priority: t.priority,
                  country: t.country,
                  location: t.location,
                  website: t.website,
                  contact_name: t.contact_name,
                  contact_email: t.contact_email,
                  last_contacted_at: t.last_contacted_at,
                })),
              };
            },
          }),
          log_school_contact: tool({
            description:
              "Record that Gareth contacted a school. Updates last_contacted and status (default contacted from todo).",
            inputSchema: z.object({
              school: z.string().describe("School slug or distinctive name fragment."),
              channel: z.enum(["email", "phone", "visit", "other"]).default("email"),
              summary: z.string().min(1).max(500).describe("What happened — one or two sentences."),
              contact_email: z.string().email().optional(),
              set_status: z.enum(["contacted", "replied", "partner", "todo", "skip"]).optional(),
            }),
            execute: async ({ school, channel, summary, contact_email, set_status }) => {
              const result = await logSchoolOutreachContact(input.supabase, {
                userId: input.diverId,
                ref: school,
                channel: channel as SchoolContactChannel,
                summary,
                contact_email,
                set_status: set_status as SchoolOutreachStatus | undefined,
              });
              if (!result.ok) return result;
              return {
                ok: true,
                slug: result.target.slug,
                name: result.target.name,
                status: result.status,
                last_contacted_at: result.target.last_contacted_at,
              };
            },
          }),
          update_school_target: tool({
            description: "Update a school target metadata without logging a new contact event.",
            inputSchema: z.object({
              school: z.string(),
              status: z.enum(["todo", "contacted", "replied", "partner", "skip"]).optional(),
              contact_name: z.string().nullable().optional(),
              contact_email: z.string().email().nullable().optional(),
              contact_note: z.string().nullable().optional(),
              notes: z.string().nullable().optional(),
              website: z.string().url().nullable().optional(),
              priority: z.number().int().min(0).max(6).optional(),
            }),
            execute: async ({ school, ...patch }) => {
              const result = await updateSchoolOutreachTarget(input.supabase, school, patch);
              if (!result.ok) return result;
              return { ok: true, target: result.target };
            },
          }),
          add_school_target: tool({
            description: "Add a missing commercial diving school to the outreach list.",
            inputSchema: z.object({
              name: z.string().min(2),
              slug: z.string().optional(),
              priority: z.number().int().min(0).max(6).optional(),
              location: z.string().optional(),
              country: z.string().optional(),
              website: z.string().url().optional(),
              notes: z.string().optional(),
            }),
            execute: async (payload) => {
              return addSchoolOutreachTarget(input.supabase, payload);
            },
          }),
        }
      : {}),
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
    needsPhoto: state.needsPhoto || (state.profile.profile.profile_status === "published" && !hasPhoto),
    pendingInboundStatus: state.pendingInboundStatus,
    appliedJobIds: [...appliedJobIds],
  };
}
