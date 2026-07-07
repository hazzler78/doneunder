import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RequestProfileButton } from "@/components/request-profile-button";
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
  showRequestButton?: boolean;
  showCvLink?: boolean;
  previewBanner?: ReactNode;
};

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
  showRequestButton = true,
  showCvLink = true,
  previewBanner,
}: AmbassadorProfileViewProps) {
  const satHoursLabel = satHours > 0 ? satHours.toLocaleString() : "Not declared";
  const diveHoursLabel = diveHours > 0 ? diveHours.toLocaleString() : "Not declared";
  const certLabels = certifications.map((cert) =>
    cert.expiry_date ? `${cert.name} (Exp ${cert.expiry_date})` : cert.name,
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10">
      {previewBanner}
      <Card>
        <div className="relative h-64 overflow-hidden rounded-t-xl border-b border-border md:h-80">
          <Image
            src="/images/ambassador-profile-shot.jpeg"
            alt={`${displayName} ambassador profile`}
            fill
            className="object-cover"
            priority
          />
        </div>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">{displayName}</h1>
              <p className="mt-2 text-cyan-200">{headline}</p>
            </div>
            <Badge className={availabilityStatus === "available" ? "bg-emerald-900/60" : ""}>
              {availabilityStatus === "available" ? "Available Now" : "Deployed"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>{shortBio}</p>
          <p className="text-muted-foreground">
            Sat hours: {satHoursLabel} • Dive hours: {diveHoursLabel} • {location || "Location not provided"}
          </p>
          <p className="text-cyan-200">{mobilizationNotice || "Mobilization notice not provided"}</p>
          {highlights.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {certLabels.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {certLabels.map((cert) => (
                <Badge key={cert}>{cert}</Badge>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {showRequestButton ? <RequestProfileButton username={username} /> : null}
            {showCvLink ? (
              <Link
                href={showRequestButton ? `/cv/${username}` : "/preview/cv"}
                target="_blank"
                className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
              >
                Open CV (Print/PDF)
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
