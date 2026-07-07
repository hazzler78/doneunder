import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAgentThread, upsertAgentThread } from "@/lib/agent-threads";
import { logAgentInteraction } from "@/lib/audit";
import { getDiverProfile, patchDiverProfile, publishDiverProfile } from "@/lib/diver-profile-service";
import type { UserRole } from "@/lib/types";

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
});

function detectPatchIntent(message: string) {
  const lower = message.toLowerCase();
  const patch: Record<string, unknown> = {};

  const headlineMatch = message.match(/(?:set\s+my\s+headline\s+to|headline\s*:)\s*(.+)$/i);
  if (headlineMatch?.[1]) patch.headline = headlineMatch[1].trim();

  const bioMatch = message.match(/(?:set\s+my\s+bio\s+to|bio\s*:)\s*(.+)$/i);
  if (bioMatch?.[1]) patch.bio = bioMatch[1].trim();

  const locationMatch = message.match(/(?:set\s+my\s+location\s+to|location\s*:)\s*(.+)$/i);
  if (locationMatch?.[1]) patch.location = locationMatch[1].trim();

  if (lower.includes("availability") && lower.includes("deployed")) {
    patch.availability_status = "deployed";
  }
  if (lower.includes("availability") && lower.includes("available")) {
    patch.availability_status = "available";
  }

  return patch;
}

function normalize(text: string) {
  return text.toLowerCase().trim();
}

type Suggestion = {
  id: string;
  title: string;
  location: string;
  reason: string;
  score: number;
};

function scoreJobsForDiver(
  jobs: Array<{ id: string; title: string; location: string | null; required_certs: string[] | null }>,
  profile: Awaited<ReturnType<typeof getDiverProfile>>,
): Suggestion[] {
  const certNames = new Set(profile.certifications.map((item) => item.name.toLowerCase()));
  const location = profile.profile.location.toLowerCase();

  return jobs
    .map((job) => {
      const required = (job.required_certs ?? []).map((item) => item.toLowerCase());
      const certHits = required.filter((cert) =>
        Array.from(certNames).some((name) => name.includes(cert) || cert.includes(name)),
      ).length;
      const locationHit =
        job.location && location ? Number(location.includes(job.location.toLowerCase()) || job.location.toLowerCase().includes(location)) : 0;
      const score = certHits * 3 + locationHit * 2;
      return {
        id: job.id,
        title: job.title,
        location: job.location ?? "Unknown",
        reason:
          certHits > 0
            ? `Matches ${certHits} required certifications and location compatibility ${locationHit ? "looks good" : "is neutral"}.`
            : "No direct cert match yet, but might still fit your profile.",
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, reply: "Please sign in first." }, { status: 401 });
    }

    const body = chatSchema.parse(await req.json());
    const message = body.message.trim();
    const messageLower = normalize(message);

    const { data: userRow } = await supabase
      .from("users")
      .select("id, role, full_name, username")
      .eq("id", user.id)
      .maybeSingle();
    const role = (userRow?.role as UserRole | undefined) ?? "diver";
    if (role === "admin") {
      return NextResponse.json({ ok: false, reply: "Admin chat workspace is not enabled yet." }, { status: 403 });
    }

    if (role === "company") {
      const threadId = `company-web-${user.id}`;
      const reply =
        "Company workspace is live. Next, I can wire candidate screening and job drafting tools to this chat. For now, ask me for screening criteria and I will keep it scoped to your company session.";
      await logAgentInteraction({
        actorId: user.id,
        feature: "web_chat_company_message",
        input: { message, threadId },
        output: { reply },
      });
      return NextResponse.json({ ok: true, role, reply });
    }

    // Ensure the diver profile row exists before creating a thread mapping.
    // agent_threads.diver_id references diver_profiles(user_id).
    const { error: ensureProfileError } = await supabase
      .from("diver_profiles")
      .upsert({ user_id: user.id }, { onConflict: "user_id" });
    if (ensureProfileError) {
      return NextResponse.json(
        { ok: false, reply: "Could not initialize diver profile context for chat." },
        { status: 500 },
      );
    }

    const service = createServiceSupabaseClient();
    const externalChatId = user.id;
    const channel = "web" as const;
    const thread =
      (await getAgentThread(service, channel, externalChatId)) ??
      (await upsertAgentThread(service, {
        diverId: user.id,
        channel,
        externalChatId,
        metadata: { role },
      }));

    let profile = await getDiverProfile(supabase, user.id);
    const patch = detectPatchIntent(message);
    const hasPatch = Object.keys(patch).length > 0;
    let reply = "";
    let suggestions: Suggestion[] = [];

    if (hasPatch) {
      profile = await patchDiverProfile(supabase, user.id, {
        ...patch,
        headline_source: "ai",
        bio_source: "ai",
      });
      reply = "Updated your profile fields. I kept this change scoped to your diver thread only.";
    }

    if (messageLower.includes("publish")) {
      const publishResult = await publishDiverProfile(supabase, user.id);
      if (!publishResult.ok) {
        return NextResponse.json({
          ok: false,
          role,
          reply: `I could not publish yet. ${publishResult.validation.errors.join(" ") || "Please review your profile and try again."}`,
          profileStatus: publishResult.profile.profile.profile_status,
        });
      }
      profile = publishResult.profile;
      reply = "Published. Your ambassador page is now live.";
    }

    if (
      messageLower.includes("job") ||
      messageLower.includes("match") ||
      messageLower.includes("proactive") ||
      hasPatch
    ) {
      const { data: jobs } = await supabase
        .from("jobs")
        .select("id,title,location,required_certs")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(20);
      suggestions = scoreJobsForDiver(jobs ?? [], profile);
      if (!reply) {
        reply = suggestions.length
          ? "I found matching opportunities for your updated profile."
          : "No strong job matches yet. I can keep monitoring as your profile evolves.";
      } else if (suggestions.length > 0) {
        reply += " I also generated fresh job suggestions based on your latest profile.";
      }
    }

    if (!reply) {
      reply =
        "I can update your profile, publish your ambassador page, and proactively match jobs. Try: 'Set my headline to ...' or 'Find jobs for me'.";
    }

    await logAgentInteraction({
      actorId: user.id,
      feature: "web_chat_diver_message",
      input: { message, threadId: thread.id, patch },
      output: { reply, suggestionsCount: suggestions.length },
    });

    return NextResponse.json({
      ok: true,
      role,
      reply,
      suggestions,
      profileStatus: profile.profile.profile_status,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, reply: "Invalid chat request payload.", details: error.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: false, reply: "Chat agent failed to process your message." }, { status: 500 });
  }
}
