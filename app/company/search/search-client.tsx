"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RevealCard } from "@/lib/company-search";
import { revealMatch, runSearch, type SearchState } from "./actions";

const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

export function CompanySearch() {
  const [state, formAction, searching] = useActionState<SearchState, FormData>(runSearch, null);
  const [revealed, setRevealed] = useState<{ searchId: string; card: RevealCard } | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [revealing, startReveal] = useTransition();

  const result = state?.ok ? state.result : null;
  const currentReveal = result && revealed?.searchId === result.searchId ? revealed.card : null;

  function onReveal(slot: number) {
    if (!result?.searchId) return;
    const searchId = result.searchId;
    setRevealError(null);
    startReveal(async () => {
      const res = await revealMatch(searchId, slot);
      if (res.ok) setRevealed({ searchId, card: res.card });
      else setRevealError(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <form action={formAction} className="grid gap-3 rounded-2xl border border-border/60 p-5 sm:grid-cols-2">
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
          <Button type="submit" disabled={searching}>
            {searching ? "Searching…" : "Search divers"}
          </Button>
        </div>
      </form>

      {state && !state.ok ? (
        <p className="text-sm text-destructive">
          {state.error}{" "}
          {state.error.includes("USD") ? (
            <Link href="/pricing" className="text-primary underline">
              Go to pricing
            </Link>
          ) : null}
        </p>
      ) : null}

      {result ? (
        result.teasers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matching divers. Try wider criteria.</p>
        ) : (
          <section className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Up to 10 anonymous matches. You can reveal <strong>one</strong> diver per search. On Unlimited the search
              expires after 30 minutes; a one-time search stays open until its 30 days run out.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {result.teasers.map(({ slot, teaser }) => (
                <Card key={slot}>
                  <CardHeader>
                    <CardTitle>Match #{slot}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <p>{teaser.certs_valid} valid certificates</p>
                    <p>Dive hours: {teaser.dive_hours_band} · Sat hours: {teaser.sat_hours_band}</p>
                    <p>
                      {teaser.available ? "Available" : "Not flagged available"}
                      {teaser.verified ? " · Verified" : ""}
                      {teaser.medical_valid ? " · Medical valid" : ""}
                      {teaser.welding ? " · Welding tickets" : ""}
                    </p>
                    <Button
                      size="sm"
                      className="mt-2"
                      disabled={revealing || Boolean(currentReveal)}
                      onClick={() => onReveal(slot)}
                    >
                      Reveal this diver
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )
      ) : null}

      {revealError ? <p className="text-sm text-destructive">{revealError}</p> : null}

      {currentReveal ? (
        <Card>
          <CardHeader>
            <CardTitle>{currentReveal.full_name ?? "Commercial diver"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {currentReveal.headline ? <p>{currentReveal.headline}</p> : null}
            <p>{currentReveal.location ?? "Location not provided"}</p>
            <p>
              Availability: {currentReveal.availability_status ?? "unknown"}
              {currentReveal.mobilization_notice ? ` · Mobilization: ${currentReveal.mobilization_notice}` : ""}
            </p>
            <p>
              Dive hours: {currentReveal.dive_hours ?? 0} · Sat hours: {currentReveal.sat_hours ?? 0}
            </p>
            {currentReveal.certifications.length > 0 ? (
              <ul className="list-disc pl-5">
                {currentReveal.certifications.map((c, i) => (
                  <li key={`${c.name}-${i}`}>
                    {c.name}
                    {c.expiry_date ? ` (expires ${c.expiry_date})` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            {currentReveal.username ? (
              <Link className="text-primary underline" href={`/cv/${currentReveal.username}`}>
                Open full CV
              </Link>
            ) : null}
            <p className="pt-2 text-muted-foreground">Run a new search to reveal the next diver.</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
