import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LOCKED_PROFILE_FIELDS } from "@/lib/company-preview";
import type { Teaser } from "@/lib/company-search";

type Props = {
  slot: number;
  teaser: Teaser;
  unlocked: boolean;
  onUnlockRequest?: () => void;
  children?: React.ReactNode;
};

/** Partial profile: initials + industry visible; rest locked with icons — never blurred. */
export function LockedCandidateCard({ slot, teaser, unlocked, onUnlockRequest, children }: Props) {
  return (
    <article className="rounded-2xl border border-border/70 bg-card/95 p-5 shadow-sm shadow-black/5">
      <div className="flex items-start gap-4">
        <div
          aria-hidden
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 font-display text-lg font-semibold tracking-wide text-heading"
        >
          {teaser.initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Match #{slot}
            {teaser.verified ? " · verified" : ""}
          </p>
          <p className="mt-1 font-display text-lg font-semibold text-heading">{teaser.industry}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {teaser.available ? "Available signal" : "Availability locked"}
            {teaser.welding ? " · welding tickets present" : ""}
          </p>
        </div>
      </div>

      {unlocked ? (
        <div className="mt-4 border-t border-border/50 pt-4 text-sm">{children}</div>
      ) : (
        <div className="mt-4 space-y-2 border-t border-border/50 pt-4">
          {LOCKED_PROFILE_FIELDS.map((label) => (
            <div
              key={label}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-surface-inset/70 px-3 py-2 text-sm"
            >
              <span className="text-muted-foreground">{label}</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-heading-muted">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                Locked
              </span>
            </div>
          ))}
          {onUnlockRequest ? (
            <Button type="button" className="mt-2 w-full" onClick={onUnlockRequest}>
              Unlock full profiles for this search
            </Button>
          ) : null}
        </div>
      )}
    </article>
  );
}
