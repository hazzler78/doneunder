import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { aiModel } from "@/lib/ai";
import {
  getDiverProfile,
  patchDiverProfile,
  publishDiverProfile,
  validateDiverProfile,
} from "@/lib/diver-profile-service";
import type { DiverProfileFull } from "@/lib/diver-profile";
import { sendEmailAsLoggedInUser } from "@/lib/email";
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
};

const profileUpdateSchema = z.object({
  headline: z.string().max(180).optional(),
  bio: z.string().max(2000).optional(),
  location: z.string().max(180).optional(),
  mobilization_notice: z.string().max(180).optional(),
  availability_status: z.enum(["available", "deployed"]).optional(),
  sat_hours: z.number().int().min(0).optional(),
  dive_hours: z.number().int().min(0).optional(),
  ambassador_public_headline: z.string().max(220).optional(),
  ambassador_short_bio: z.string().max(1200).optional(),
  ambassador_key_highlights: z.array(z.string().max(180)).max(12).optional(),
});

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
    recent_experiences: profile.experiences.slice(0, 8).map((exp) => ({
      role_title: exp.role_title,
      company: exp.company,
      project_name: exp.project_name,
      location: exp.location,
      date_start: exp.date_start,
      date_end: exp.date_end,
      summary: exp.summary,
    })),
    certifications: profile.certifications.map((cert) => ({
      name: cert.name,
      issuing_body: cert.issuing_body,
      issue_date: cert.issue_date,
      expiry_date: cert.expiry_date,
    })),
    validation: {
      errors: validation.errors,
      warnings: validation.warnings,
    },
  };
}

function buildSystemPrompt(context: ReturnType<typeof buildProfileContext>) {
  return `You are Hermes, the DoneUnder diver profile agent.

You help commercial divers build, refine, review, and publish their ambassador profile, find matching offshore jobs, and send professional emails on their behalf.

Conversation style:
- Talk naturally, like a knowledgeable recruiter — not a command menu.
- Answer questions directly using the profile context below (e.g. "how does it look?", "can you see my CV?", "what's missing?").
- When the diver wants a change, use update_profile. When they want to go live, use publish_profile. When they want opportunities, use find_matching_jobs.
- When they want to email a contractor, recruiter, or contact, draft the message first, show them to/subject/body, and only call send_email after they clearly confirm. Always set confirmed=true only after explicit approval.
- Emails are sent as the logged-in diver (their name + email identity). Never invent a different sender.
- If email_capability.configured is false, explain that outbound email is not configured yet — do not pretend you sent mail.
- If profile_status is draft, the owner can preview at /preview (ambassador) and /preview/cv (full CV). Do NOT send them to /{username} until published — that URL returns 404 in draft.
- If profile_status is published, the public ambassador URL is /{username}.
- Confirm before publishing if their intent is ambiguous.
- Never invent certifications, roles, or hours that are not in the profile context.
- If structured CV data is missing, tell them to upload and process files in the workspace panel first.
- Keep replies concise but helpful — a short paragraph or a few bullets, not a wall of text unless they ask for detail.

Current profile context (source of truth):
${JSON.stringify(context, null, 2)}`;
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
  const profile = await getDiverProfile(input.supabase, input.diverId);
  const suggestions: JobSuggestion[] = [];

  if (!isAiConfigured()) {
    return {
      reply:
        "Hermes AI is not configured yet (missing XAI_API_KEY). I can still process CV uploads from the files panel, but natural chat replies need the AI key enabled in your environment.",
      suggestions,
      profile,
    };
  }

  const context = buildProfileContext(profile, input.username, input.displayName, input.userEmail);
  const system = buildSystemPrompt(context);

  const state = { profile, suggestions };

  const tools = {
    update_profile: tool({
      description: "Update diver profile fields after the diver asks for a change.",
      inputSchema: profileUpdateSchema,
      execute: async (patch) => {
        try {
          const withSources = {
            ...patch,
            ...(patch.headline ? { headline_source: "ai" as const } : {}),
            ...(patch.bio || patch.ambassador_short_bio ? { bio_source: "ai" as const } : {}),
          };
          state.profile = await patchDiverProfile(input.supabase, input.diverId, withSources);
          return {
            ok: true,
            updated_fields: Object.keys(patch),
            profile_status: state.profile.profile.profile_status,
            sat_hours: state.profile.profile.sat_hours,
            dive_hours: state.profile.profile.dive_hours,
          };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
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
        "Send an email as the logged-in diver after they confirm recipient, subject, and body. Never send without confirmed=true.",
      inputSchema: z.object({
        to: z.string().email().describe("Recipient email address"),
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(8000).describe("Plain-text email body written in the diver's voice"),
        confirmed: z
          .boolean()
          .describe("True only after the diver explicitly approved sending this exact email."),
      }),
      execute: async ({ to, subject, body, confirmed }) => {
        if (!confirmed) {
          return {
            ok: false,
            message: "Not sent. Show the draft and wait for the diver to confirm before calling again with confirmed=true.",
            draft: { to, subject, body },
          };
        }

        if (!input.userEmail) {
          return { ok: false, error: "Logged-in account has no email address on file." };
        }

        const result = await sendEmailAsLoggedInUser({
          userEmail: input.userEmail,
          userDisplayName: input.displayName,
          to,
          subject,
          body,
        });

        await logAgentInteraction({
          actorId: input.diverId,
          feature: "hermes_send_email",
          input: { to, subject, bodyLength: body.length },
          output: result,
        });

        if (!result.ok) {
          return { ok: false, error: result.error };
        }

        return {
          ok: true,
          id: result.id,
          from: result.from,
          replyTo: result.replyTo,
          to,
          subject,
        };
      },
    }),
  };

  const result = await generateText({
    model: aiModel,
    system,
    messages: toModelMessages(input.history, input.message),
    tools,
    stopWhen: stepCountIs(6),
  });

  const reply =
    result.text.trim() ||
    "I processed your request. Tell me if you want to adjust anything else on your profile.";

  return {
    reply,
    suggestions: state.suggestions,
    profile: state.profile,
  };
}
