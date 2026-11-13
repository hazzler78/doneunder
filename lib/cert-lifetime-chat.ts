import {
  hasStoredExpiryDate,
  isLifetimeTicketType,
  lifetimeStoredExpiryShouldClear,
  showsCertificateAsLifetime,
} from "@/lib/cert-lifetime";
import { applyConversationalCvUpdate } from "@/lib/diver-profile-service";
import type { DiverCertificationInput, DiverProfileFull } from "@/lib/diver-profile";
import type { SupabaseClient } from "@supabase/supabase-js";

const NO_EXPIRY_CLAIM =
  /\b(?:no expiry|no expiration|doesn'?t expire|does not expire|do not expire|never expires|is lifetime|without expiry|not expire|sans expiration)\b/i;

/** Diver message states that a ticket has no expiry / is lifetime. */
export function messageClaimsTicketHasNoExpiry(message: string) {
  return NO_EXPIRY_CLAIM.test(message);
}

function certNameMentionedInMessage(message: string, certName: string) {
  const msg = message.toLowerCase().trim();
  const name = certName.toLowerCase().trim();
  if (!msg || !name || name.length < 3) return false;
  if (msg.includes(name)) return true;
  const parts = name.split(/\s+/).filter(Boolean);
  for (let len = Math.min(parts.length, 6); len >= 2; len -= 1) {
    const phrase = parts.slice(0, len).join(" ");
    if (phrase.length >= 5 && msg.includes(phrase)) return true;
  }
  if (name.length >= 8 && msg.includes(name.slice(0, Math.min(name.length, 24)))) {
    return true;
  }
  return false;
}

/** Certificates the diver named in a no-expiry message. Longer names win over shorter overlaps. */
export function certificationsMentionedInNoExpiryMessage(
  message: string,
  certs: DiverCertificationInput[],
): DiverCertificationInput[] {
  if (!messageClaimsTicketHasNoExpiry(message)) return [];
  const sorted = [...certs].sort((a, b) => b.name.length - a.name.length);
  const hits: DiverCertificationInput[] = [];
  for (const cert of sorted) {
    if (!certNameMentionedInMessage(message, cert.name)) continue;
    const coveredByLongerHit = hits.some(
      (existing) =>
        existing.name.length > cert.name.length && certNameMentionedInMessage(message, existing.name),
    );
    if (!coveredByLongerHit) hits.push(cert);
  }
  return hits;
}

function certificationNeedsLifetimeNoExpirySave(cert: DiverCertificationInput) {
  if (!showsCertificateAsLifetime(cert) && !isLifetimeTicketType(cert)) return false;
  if (lifetimeStoredExpiryShouldClear(cert)) return true;
  return cert.no_expiry !== true && hasStoredExpiryDate(cert.expiry_date);
}

export type LifetimeNoExpiryChatClearResult = {
  profile: DiverProfileFull;
  clearedNames: string[];
  cvUpdated: boolean;
};

/**
 * When the diver states a lifetime ticket has no expiry, clear a stale stored expiry in the DB
 * without relying on the model to call update_cv.
 */
export async function clearLifetimeExpiryFromChatMessage(
  supabase: SupabaseClient,
  diverId: string,
  message: string,
  profile: DiverProfileFull,
): Promise<LifetimeNoExpiryChatClearResult> {
  const mentioned = certificationsMentionedInNoExpiryMessage(message, profile.certifications);
  const targets = mentioned.filter((cert) => certificationNeedsLifetimeNoExpirySave(cert) && cert.id);
  if (targets.length === 0) {
    return { profile, clearedNames: [], cvUpdated: false };
  }

  const result = await applyConversationalCvUpdate(
    supabase,
    diverId,
    {
      update_certifications: targets.map((cert) => ({
        match: { id: cert.id! },
        patch: { no_expiry: true, expiry_confirmed: true },
      })),
    },
    { sourceRef: "source: lifetime-no-expiry-chat" },
  );

  if (!result.ok) {
    console.error("Lifetime no-expiry chat clear failed:", result.errors.join("; "));
    return { profile, clearedNames: [], cvUpdated: false };
  }

  return {
    profile: result.profile,
    clearedNames: targets.map((cert) => cert.name),
    cvUpdated: true,
  };
}

/** Model replies that wrongly skip a save when a stale expiry is still on file. */
export function replyClaimsLifetimeNoExpiryAlreadySaved(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lifetime = /\b(?:lifetime|no expiry)\b/i.test(trimmed);
  const settled = /\b(?:already|no update needed|no change needed|confirmed on your profile|nothing to change)\b/i.test(
    trimmed,
  );
  return lifetime && settled;
}
