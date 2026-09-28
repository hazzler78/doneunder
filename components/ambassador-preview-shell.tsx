"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AmbassadorPhotoUpload } from "@/components/ambassador-photo-upload";
import {
  AmbassadorProfileView,
  type AmbassadorCertification,
} from "@/components/ambassador-profile-view";
import type { ReactNode } from "react";

type Props = {
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
  avatarUrl: string | null;
  previewBanner: ReactNode;
};

export function AmbassadorPreviewShell(props: Props) {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState(props.avatarUrl);

  return (
    <AmbassadorProfileView
      {...props}
      avatarUrl={avatarUrl}
      showRequestButton={false}
      showCvLink
      photoSlot={
        <AmbassadorPhotoUpload
          currentUrl={avatarUrl}
          onUploaded={(url) => {
            setAvatarUrl(url);
            router.refresh();
          }}
        />
      }
    />
  );
}
