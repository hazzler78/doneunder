import type { DiverProfileFull } from "@/lib/diver-profile";
import type { DiverOnboardingBundle } from "@/lib/diver-private-details";

export type ClientFormKind = "beacon_offshore_cv_docx" | "beacon_pdpa_pdf" | "unknown";

export type PdpaConsentChoice = "consent" | "decline";

export type BeaconPdpaInput = {
  general_personal_data: PdpaConsentChoice;
  sensitive_personal_data: PdpaConsentChoice;
  transfer_abroad: PdpaConsentChoice;
  signer_name: string;
  signed_date: string;
  signature_png?: Uint8Array;
};

export type DiverFormSource = {
  displayName: string;
  email: string | null;
  positionTitle: string;
  profile: DiverProfileFull;
  bundle: DiverOnboardingBundle;
  profilePictureBytes?: Uint8Array;
};

export type ClientFormFillResult = {
  ok: true;
  kind: ClientFormKind;
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  missingFields: string[];
  previewNotes?: string[];
  consentSnapshot?: Record<string, unknown>;
};

export type ClientFormFillFailure = {
  ok: false;
  error: string;
  kind?: ClientFormKind;
  missingFields?: string[];
};
