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
import { sendEmailAsLoggedInUser, type EmailAttachment } from "@/lib/email";
import { buildDiverCvPdf, cvPdfFilename } from "@/lib/cv-pdf";
import { isAiConfigured, isEmailConfigured } from "@/lib/feature-flags";
import { logAgentInteraction } from "@/lib/audit";

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
};

export type HermesDiverTurnResult = {
  reply: string;
  suggestions: JobSuggestion[];
  profile: DiverProfileFull;
  cvUpdated: boolean;
  updatedParts: string[];
};

function truncateText(value: string | null | undefined, max = 280) {
  const text = value?.trim() ?? "";
  if (!text) return undefined;
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function scoreJobsForDiver(
  jobs: Array<{ id: string; title: string; location: string | null; required_certs: string[] | null }>,
  profile: DiverProfileFull,
): JobSuggestion[] {
  const certNames = new Set(profile.certifications.map((item) => item.name.toLowerCase()));
  const location = profile.profile.location.toLowerCase();

  return jobs
    .map((job) => {
      const required = (job.required_certs ?? []).map((item) => item.toLowerCase());
      const certHits = required.filter((cert) =>
        [...certNames].some((name) => name.includes(cert) || cert.includes(name)),
      ).length;
      const locationHit =
        job.location && location
          ? Number(location.includes(job.location.toLowerCase()) || job.location.toLowerCase().includes(location))
          : 0;
      const score = certHits * 3 + locationHit * 2;
      return {
        id: job.id,
        title: job.title,
        location: job.location ?? "Unknown",
        reason:
          certHits > 0
            ? `Matches ${certHits} required certifications; location fit is ${locationHit ? "strong" : "neutral"}.`
            : "No direct certification match yet, but may still be worth reviewing.",
        score,
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
    },
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

Updating the CV from chat (this is the main way to edit):
- When the diver wants ANY change to their CV or profile, you MUST call update_cv. Do not claim you updated anything unless the tool returns ok=true.
- They can talk in plain English: "add this job", "set sat hours to 2100", "rewrite my summary", "add my IMCA ticket", or paste CV text.
- Use add_* for new rows, update_* for existing rows (match by id, company, role, or certificate name), remove_* to delete, and replace_* only when they paste a full CV or clearly want a whole section rewritten.
- For a new job, always call update_cv with add_experiences. Put company, a short role_title (extract one from the job description if they did not label it), dates, and summary. Do not send them to re-upload a PDF when they already typed the job in chat.
- Write every stored field in English. Translate if needed; keep official certificate titles and proper names.
- After a successful update_cv (ok=true), briefly confirm what you saved and invite them to preview /preview/cv.
- If update_cv returns ok=false, tell them it was NOT saved and quote the error. Do not link /preview/cv as if the change is there.
- validation.warnings (for example missing cert expiry dates) do NOT block adding a job. Only a failed update_cv call blocks a save.
- If the profile is empty, invite them to paste CV text here or attach a PDF in the chat. You can build the CV from conversation — do not send them to a form.
- If counts.experiences is 0, the public CV currently shows "No project history has been added yet." That is the most important gap. Extract jobs from the diver's message, pasted CV text, or profile.polished markdown/json and call update_cv with add_experiences or replace_experiences. Do not say the CV is complete until at least one job is saved.
- Never invent that a company or role is on the CV unless it appears in the profile context or a successful update_cv result.

Other tools:
- publish_profile when they want to go live. Confirm first if their intent is ambiguous.
- find_matching_jobs when they want opportunities.
- For email: draft to/subject/body first, then call send_email only after they clearly confirm. Set confirmed=true only after explicit approval.
- If they ask to send their CV, set attach_cv=true. The tool attaches a PDF of the current profile. Never write that a CV is attached unless send_email returns attached filenames.
- Do not put "please find my CV attached" in a draft unless you will call send_email with attach_cv=true.
- Emails are sent as the logged-in diver. Never invent a different sender.
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

function shouldAttachCv(input: { attachCv?: boolean; subject: string; body: string }) {
  if (input.attachCv === true) return true;
  const blob = `${input.subject}\n${input.body}`;
  const mentionsCv = /\b(cv|curriculum vitae)\b/i.test(blob);
  const claimsAttached = /\b(attached|attachment)\b/i.test(blob);
  if (input.attachCv === false && !mentionsCv && !claimsAttached) return false;
  return mentionsCv || claimsAttached;
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

export async function runHermesDiverTurn(input: HermesDiverTurnInput): Promise<HermesDiverTurnResult> {
  let profile = await getDiverProfile(input.supabase, input.diverId);
  try {
    profile = await persistMissingChildRowsFromJson(input.supabase, input.diverId);
  } catch (error) {
    console.error("Failed to restore CV rows from polished JSON:", error);
  }
  const suggestions: JobSuggestion[] = [];

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

  const context = buildProfileContext(profile, input.username, input.displayName, input.userEmail);
  const system = buildSystemPrompt(context);

  const state = {
    profile,
    suggestions,
    cvUpdated: false,
    updatedParts: [] as string[],
    emailSent: false,
    emailAttached: [] as string[],
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
    find_matching_jobs: tool({
      description: "Find open jobs that match the diver certifications and location.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data: jobs } = await input.supabase
          .from("jobs")
          .select("id,title,location,required_certs")
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(20);
        state.suggestions = scoreJobsForDiver(jobs ?? [], state.profile);
        return {
          count: state.suggestions.length,
          suggestions: state.suggestions,
        };
      },
    }),
    send_email: tool({
      description:
        "Send an email as the logged-in diver after they confirm recipient, subject, and body. Set attach_cv=true when sending a CV. Never send without confirmed=true.",
      inputSchema: z.object({
        to: z.string().email().describe("Recipient email address"),
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(8000).describe("Plain-text email body in English, written in the diver's voice"),
        attach_cv: z
          .boolean()
          .optional()
          .describe("True when the diver wants their CV attached. Required for 'send my CV' requests."),
        confirmed: z
          .boolean()
          .describe("True only after the diver explicitly approved sending this exact email."),
      }),
      execute: async ({ to, subject, body, attach_cv: attachCv, confirmed }) => {
        if (!confirmed) {
          return {
            ok: false,
            message: "Not sent. Show the draft and wait for the diver to confirm before calling again with confirmed=true.",
            draft: { to, subject, body, attach_cv: shouldAttachCv({ attachCv, subject, body }) },
          };
        }

        if (!input.userEmail) {
          return { ok: false, error: "Logged-in account has no email address on file." };
        }

        const attachments: EmailAttachment[] = [];
        const attach = shouldAttachCv({ attachCv, subject, body });
        if (attach) {
          try {
            const filename = cvPdfFilename(input.displayName);
            const content = buildDiverCvPdf(state.profile, input.displayName);
            if (content.length < 100 || !content.subarray(0, 5).toString("utf8").startsWith("%PDF")) {
              return { ok: false, error: "Could not build a CV PDF to attach." };
            }
            attachments.push({ filename, content, contentType: "application/pdf" as const });
          } catch (error) {
            return { ok: false, error: `Could not attach CV: ${describeToolFailure(error)}` };
          }
        }

        let outgoingBody = body;
        if (attach && input.username && !outgoingBody.includes(`/${input.username}`)) {
          outgoingBody = `${outgoingBody.trim()}\n\nOnline CV: https://doneunder.ai/cv/${input.username}`;
        }

        const result = await sendEmailAsLoggedInUser({
          userEmail: input.userEmail,
          userDisplayName: input.displayName,
          to,
          subject,
          body: outgoingBody,
          attachments,
        });

        await logAgentInteraction({
          actorId: input.diverId,
          feature: "hermes_send_email",
          input: {
            to,
            subject,
            bodyLength: outgoingBody.length,
            attachCv: attach,
            attached: result.ok ? result.attached : [],
          },
          output: result,
        });

        if (!result.ok) {
          return { ok: false, error: result.error };
        }

        state.emailSent = true;
        state.emailAttached = result.attached;

        return {
          ok: true,
          id: result.id,
          from: result.from,
          replyTo: result.replyTo,
          to,
          subject,
          attached: result.attached,
        };
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
  };
}
