"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import {
  HermesCompanyBrief,
  type HermesBriefResult,
} from "@/components/company/hermes-company-brief";
import { LockedCandidateCard } from "@/components/company/locked-candidate-card";
import { UnlockPanel } from "@/components/company/unlock-panel";
import { Button } from "@/components/ui/button";
import { AnalyticsEvent } from "@/lib/analytics-events";
import type { CompanyCheckoutAccess } from "@/lib/company-billing";
import type { RevealCard, SearchResult } from "@/lib/company-search";
import { trackAnalyticsEvent } from "@/lib/track-analytics";
import { revealMatch, runSearch, type SearchState } from "./actions";

const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

type Props = {
  subscriptionActive: boolean;
  customerEmail: string | null;
  companyName: string | null;
  stripeConfigured: boolean;
  billingSuccess?: CompanyCheckoutAccess | null;
};

export function CompanySearch({
  subscriptionActive,
  customerEmail,
  companyName,
  stripeConfigured,
  billingSuccess = null,
}: Props) {
  const [state, formAction, searching] = useActionState<SearchState, FormData>(runSearch, null);
  const [hermes, setHermes] = useState<HermesBriefResult | null>(null);
  const [unlocked, setUnlocked] = useState(Boolean(subscriptionActive || billingSuccess));
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [accessNote, setAccessNote] = useState<string | null>(null);
  const [rpcReveal, setRpcReveal] = useState<RevealCard | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);

  useEffect(() => {
    trackAnalyticsEvent(AnalyticsEvent.CompanySearchView, {
      subscription_active: subscriptionActive,
    });
  }, [subscriptionActive]);

  useEffect(() => {
    if (!billingSuccess) return;
    setUnlocked(true);
    setAccessNote(
      billingSuccess === "monthly"
        ? "Monthly access is active for this session. Full profiles unlock with each search while subscribed."
        : "This search is unlocked. A new search will need its own one-time unlock or a monthly plan.",
    );
  }, [billingSuccess]);

  const formResult = state?.ok ? state.result : null;
  const activeResult: SearchResult | null = hermes?.result ?? formResult;
  const previewProfiles = hermes?.profiles ?? (state?.ok ? state.profiles ?? [] : []);
  const hermesSummary = hermes?.summary ?? (state?.ok ? state.hermesSummary : null);
  const matchCount = activeResult?.matchCount ?? 0;
  const showUnlocked = unlocked || Boolean(activeResult?.unlocked);

  const profilesBySlot = useMemo(() => {
    const map = new Map<number, RevealCard>();
    previewProfiles.forEach((profile, index) => map.set(index + 1, profile));
    return map;
  }, [previewProfiles]);

  function requestUnlock() {
    setUnlockOpen(true);
  }

  function demoUnlock(access: CompanyCheckoutAccess) {
    setUnlocked(true);
    setUnlockOpen(false);
    setAccessNote(
      access === "monthly"
        ? "Demo monthly access — full profiles shown. Wire Stripe webhook to persist subscription_status=active."
        : "Demo one-time unlock — full profiles for this search only. New search stays locked until paid again.",
    );
  }

  function onHermesResult(outcome: HermesBriefResult) {
    setHermes(outcome);
    setRpcReveal(null);
    // A new Hermes search is locked again unless monthly is already active.
    if (!subscriptionActive && billingSuccess !== "monthly") {
      setUnlocked(false);
    }
  }

  async function onRpcReveal(slot: number) {
    if (!activeResult?.searchId || activeResult.source !== "rpc") return;
    setRevealError(null);
    const res = await revealMatch(activeResult.searchId, slot);
    if (res.ok) setRpcReveal(res.card);
    else setRevealError(res.error);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/80 px-4 py-3 text-sm text-muted-foreground">
        {companyName ? (
          <p>
            Signed in as <span className="font-medium text-heading">{companyName}</span>
            {subscriptionActive ? " · monthly access active" : " · search preview unlocked until payment"}
          </p>
        ) : (
          <p>Company search preview. Match counts and locked cards are free; full profiles require unlock.</p>
        )}
        {accessNote ? <p className="mt-1 text-heading-muted">{accessNote}</p> : null}
      </div>

      <HermesCompanyBrief onResult={onHermesResult} />

      <details className="rounded-2xl border border-border/60 p-5">
        <summary className="cursor-pointer text-sm font-medium text-heading">
          Or use classic filters
        </summary>
        <form action={formAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Required certificates (comma separated)</span>
            <input name="certs" placeholder="HSE Surface Supplied, IMCA Sat" className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Needed until</span>
            <input name="needed_until" type="date" className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Location contains</span>
            <input name="location" maxLength={80} className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Min dive hours</span>
            <input name="min_dive_hours" type="number" min={0} className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Min sat hours</span>
            <input name="min_sat_hours" type="number" min={0} className={inputClass} />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-sm font-medium">Welding tickets (any of, comma separated)</span>
            <input name="welding" className={inputClass} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="available_only" defaultChecked /> Available now only
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="verified_only" /> Verified only
          </label>
          <div className="sm:col-span-2">
            <Button
              type="submit"
              disabled={searching}
              onClick={() => {
                setHermes(null);
              }}
            >
              {searching ? "Searching…" : "Search divers"}
            </Button>
          </div>
        </form>
      </details>

      {state && !state.ok ? <p className="text-sm text-destructive">{state.error}</p> : null}

      {activeResult ? (
        activeResult.teasers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matching divers. Try a wider brief or filters.</p>
        ) : (
          <section className="space-y-4">
            <div className="rounded-2xl border border-primary/25 bg-primary/10 px-4 py-4">
              <p className="font-display text-2xl font-semibold text-heading">
                {matchCount} candidate{matchCount === 1 ? "" : "s"} match this search
              </p>
              {hermesSummary ? <p className="mt-1 text-sm text-heading-muted">{hermesSummary}</p> : null}
              <p className="mt-1 text-sm text-muted-foreground">
                {showUnlocked
                  ? "Full profiles are open for this search."
                  : "Initials and industry are visible. Name, tickets, hours, and contact stay locked until you unlock this search — no blurred tease."}
              </p>
              {!showUnlocked ? (
                <Button type="button" className="mt-3" onClick={requestUnlock}>
                  Unlock this search
                </Button>
              ) : null}
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {activeResult.teasers.map(({ slot, teaser }) => {
                const profile = profilesBySlot.get(slot);
                return (
                  <LockedCandidateCard
                    key={slot}
                    slot={slot}
                    teaser={teaser}
                    unlocked={showUnlocked}
                    onUnlockRequest={showUnlocked ? undefined : requestUnlock}
                  >
                    {showUnlocked && profile ? (
                      <div className="space-y-1">
                        <p className="font-medium text-heading">{profile.full_name}</p>
                        {profile.headline ? <p>{profile.headline}</p> : null}
                        <p>{profile.location}</p>
                        <p>
                          Dive hours: {profile.dive_hours ?? 0} · Sat hours: {profile.sat_hours ?? 0}
                        </p>
                        {profile.certifications.length > 0 ? (
                          <ul className="list-disc pl-5">
                            {profile.certifications.map((c, i) => (
                              <li key={`${c.name}-${i}`}>{c.name}</li>
                            ))}
                          </ul>
                        ) : null}
                        {profile.username ? (
                          <Link className="text-primary underline" href={`/cv/${profile.username}`}>
                            Open full CV
                          </Link>
                        ) : null}
                      </div>
                    ) : showUnlocked && activeResult.source === "rpc" ? (
                      <div className="space-y-2">
                        <p className="text-muted-foreground">
                          Live match — reveal opens the full ambassador card for this slot.
                        </p>
                        <Button type="button" size="sm" onClick={() => void onRpcReveal(slot)}>
                          Reveal this diver
                        </Button>
                      </div>
                    ) : null}
                  </LockedCandidateCard>
                );
              })}
            </div>
          </section>
        )
      ) : null}

      {revealError ? <p className="text-sm text-destructive">{revealError}</p> : null}
      {rpcReveal ? (
        <div className="rounded-2xl border border-border/70 bg-card p-5 text-sm">
          <p className="font-display text-xl font-semibold text-heading">
            {rpcReveal.full_name ?? "Commercial diver"}
          </p>
          {rpcReveal.headline ? <p className="mt-1">{rpcReveal.headline}</p> : null}
          <p className="mt-1">{rpcReveal.location ?? "Location not provided"}</p>
          {rpcReveal.username ? (
            <Link className="mt-2 inline-block text-primary underline" href={`/cv/${rpcReveal.username}`}>
              Open full CV
            </Link>
          ) : null}
        </div>
      ) : null}

      <UnlockPanel
        open={unlockOpen}
        matchCount={matchCount}
        searchId={activeResult?.searchId ?? null}
        customerEmail={customerEmail}
        onClose={() => setUnlockOpen(false)}
        onDemoUnlock={demoUnlock}
        stripeConfigured={stripeConfigured}
      />
    </div>
  );
}
