import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { RequestProfileButton } from "@/components/request-profile-button";
import { buttonVariants } from "@/components/ui/button";
import { avatarFramingStyle, avatarImageSrc, readAvatarFraming } from "@/lib/avatar-focal";
import { SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

export type AmbassadorCertification = {
  name: string;
  expiry_date?: string | null;
};

export type AmbassadorProfileViewProps = {
  displayName: string;
  username: string;
  headline: string | null;
  shortBio: string | null;
  highlights: string[];
  satHours: number;
  diveHours: number;
  location: string | null;
  mobilizationNotice: string | null;
  availabilityStatus: "available" | "deployed";
  certifications: AmbassadorCertification[];
  avatarUrl?: string | null;
  showRequestButton?: boolean;
  showCvLink?: boolean;
  previewBanner?: ReactNode;
  photoSlot?: ReactNode;
};

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "DU";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function formatHours(value: number) {
  if (!value || value <= 0) return null;
  return value.toLocaleString("en-GB");
}

function shortCertLabel(cert: AmbassadorCertification) {
  const name = cert.name.trim();
  if (!cert.expiry_date) return name;
  const year = cert.expiry_date.slice(0, 4);
  return year ? `${name} · ${year}` : name;
}

export function AmbassadorProfileView({
  displayName,
  username,
  headline,
  shortBio,
  highlights,
  satHours,
  diveHours,
  location,
  mobilizationNotice,
  availabilityStatus,
  certifications,
  avatarUrl,
  showRequestButton = true,
  showCvLink = true,
  previewBanner,
  photoSlot,
}: AmbassadorProfileViewProps) {
  const sat = formatHours(satHours);
  const dive = formatHours(diveHours);
  const topHighlights = highlights.filter(Boolean).slice(0, 4);
  const topCerts = certifications.filter((c) => c.name?.trim()).slice(0, 6);
  const available = availabilityStatus === "available";
  const shareUrl = `${SITE_URL}/${username}`;
  const photoSrc = avatarImageSrc(avatarUrl);
  const framing = readAvatarFraming(avatarUrl);
  const frameStyle = avatarFramingStyle(framing);

  return (
    <div className="relative mx-auto w-full max-w-lg section-pad py-8 md:py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(ellipse_at_50%_0%,var(--glow-1),transparent_60%)]"
      />

      {previewBanner ? <div className="mb-6 animate-fade-up">{previewBanner}</div> : null}
      {photoSlot ? <div className="mb-4 animate-fade-up">{photoSlot}</div> : null}

      <article className="product-frame animate-fade-up-delay-1 overflow-hidden rounded-2xl">
        <div className="relative px-5 pb-2 pt-6 sm:px-6">
          <div className="absolute left-5 top-5 z-10 sm:left-6">
            <span
              className={cn(
                "inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
                available ? "bg-success/20 text-success" : "bg-muted text-muted-foreground",
              )}
            >
              {available ? "Available" : "Deployed"}
            </span>
          </div>

          <div className="mx-auto mt-4 flex justify-center">
            <div className="relative h-44 w-44 overflow-hidden rounded-full border border-border/80 bg-surface-muted shadow-[0_12px_40px_-24px_rgba(11,36,51,0.55)] sm:h-52 sm:w-52">
              {photoSrc ? (
                <Image
                  src={photoSrc}
                  alt={displayName}
                  fill
                  priority
                  className="object-cover"
                  style={frameStyle}
                  sizes="208px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-surface-muted to-card">
                  <span className="font-display text-4xl font-semibold tracking-tight text-heading/80 sm:text-5xl">
                    {initialsFromName(displayName)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-5 px-5 pb-6 pt-5 sm:px-6">
          <header className="animate-fade-up-delay-2 space-y-2 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              doneunder.ai/{username}
            </p>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-heading sm:text-4xl">
              {displayName}
            </h1>
            {headline ? (
              <p className="mx-auto max-w-md text-base text-heading-muted sm:text-lg">{headline}</p>
            ) : null}
          </header>

          <dl className="grid grid-cols-3 gap-2 border-y border-border/60 py-3 text-center">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Based</dt>
              <dd className="mt-1 text-sm font-medium text-heading">{location?.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Sat</dt>
              <dd className="mt-1 text-sm font-medium text-heading">{sat ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Dive hrs</dt>
              <dd className="mt-1 text-sm font-medium text-heading">{dive ?? "—"}</dd>
            </div>
          </dl>

          {mobilizationNotice?.trim() ? (
            <p className="text-sm text-heading-muted">
              <span className="font-medium text-heading">Mobilise:</span> {mobilizationNotice}
            </p>
          ) : null}

          {shortBio?.trim() ? (
            <p className="text-sm leading-relaxed text-foreground/90 line-clamp-4">{shortBio}</p>
          ) : null}

          {topHighlights.length > 0 ? (
            <ul className="space-y-1.5">
              {topHighlights.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-heading-muted">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {topCerts.length > 0 ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Tickets
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {topCerts.map((cert) => (
                  <li
                    key={`${cert.name}-${cert.expiry_date ?? ""}`}
                    className="rounded-md border border-border/70 bg-surface-muted/60 px-2 py-1 text-[11px] text-heading-muted"
                  >
                    {shortCertLabel(cert)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
            {showRequestButton ? (
              <div className="min-w-0 flex-1 [&_button]:w-full">
                <RequestProfileButton username={username} />
              </div>
            ) : null}
            {showCvLink ? (
              <Link
                href={showRequestButton ? `/cv/${username}` : "/preview/cv"}
                target="_blank"
                className={cn(
                  buttonVariants({ size: "lg", variant: showRequestButton ? "outline" : "default" }),
                  "w-full sm:w-auto",
                )}
              >
                Full CV
              </Link>
            ) : null}
          </div>

          <p className="pt-1 text-center text-[11px] text-muted-foreground">
            Share this card ·{" "}
            <a href={shareUrl} className="text-heading-muted hover:text-primary hover:underline">
              {shareUrl.replace(/^https?:\/\//, "")}
            </a>
          </p>
        </div>
      </article>
    </div>
  );
}
