"use client";

import { cn } from "@/lib/utils";

export type HermesVoicePhase = "idle" | "listening" | "searching" | "error";

/**
 * Cursor live-call style status badge: visible while voice is active and/or
 * Hermes tools (criteria + candidate search) are running in the background.
 */
export function HermesVoiceBadge({
  phase,
  detail,
}: {
  phase: HermesVoicePhase;
  detail?: string | null;
}) {
  if (phase === "idle") return null;

  const label =
    phase === "listening"
      ? "Listening"
      : phase === "searching"
        ? "Hermes searching"
        : "Voice unavailable";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm",
        phase === "listening" && "border-primary/40 bg-primary/15 text-heading",
        phase === "searching" && "border-heading-muted/30 bg-surface-inset text-heading",
        phase === "error" && "border-amber-400/40 bg-amber-400/10 text-amber-950 dark:text-amber-100",
      )}
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden
        className={cn(
          "relative flex h-2.5 w-2.5",
          phase !== "error" && "after:absolute after:inset-0 after:animate-ping after:rounded-full after:bg-primary/50",
        )}
      >
        <span
          className={cn(
            "relative h-2.5 w-2.5 rounded-full",
            phase === "error" ? "bg-amber-500" : "bg-primary",
          )}
        />
      </span>
      <span>{label}</span>
      {detail ? <span className="max-w-[14rem] truncate text-muted-foreground">{detail}</span> : null}
    </div>
  );
}
