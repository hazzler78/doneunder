import {
  CV_PROCESS_TIMEOUT_MESSAGE,
  UPLOAD_REQUEST_FAILED_MESSAGE,
  isUploadTimeoutError,
  messageFromUploadError,
} from "@/lib/upload-deadline";

export const CV_PROCESSING_STATUS = "Processing your CV…";
export const CERT_UPLOAD_STATUS = "Uploading…";

export type RejectedUploadFile = {
  name: string;
  message: string;
};

export type WorkspaceUploadStart = {
  /** Every selected file was rejected, or nothing was selected. Do not enter the busy state. */
  blocked: boolean;
  acceptedCv: boolean;
  acceptedCertCount: number;
  rejected: RejectedUploadFile[];
  phase: "cv" | "certs" | null;
  /** Hermes line while a real upload is in flight. Null when nothing will be stored. */
  activeStatus: typeof CV_PROCESSING_STATUS | typeof CERT_UPLOAD_STATUS | null;
  error: string | null;
};

export function formatStoredFailure(stored: number, errors: string[]) {
  return `Stored ${stored} file(s). Failed: ${errors.join(" ")}`;
}

export function beginWorkspaceUpload(input: {
  hasCv: boolean;
  cvError: string | null;
  cvName: string | null;
  certificates: Array<{ name: string; error: string | null }>;
}): WorkspaceUploadStart {
  const rejected: RejectedUploadFile[] = [];
  const acceptedCv = Boolean(input.hasCv && !input.cvError);
  if (input.hasCv && input.cvError) {
    rejected.push({ name: input.cvName?.trim() || "CV", message: input.cvError });
  }
  let acceptedCertCount = 0;
  for (const cert of input.certificates) {
    if (cert.error) rejected.push({ name: cert.name, message: cert.error });
    else acceptedCertCount += 1;
  }

  if (!acceptedCv && acceptedCertCount === 0) {
    const error =
      rejected.length > 0
        ? formatStoredFailure(
            0,
            rejected.map((item) => `${item.name}: ${item.message}`),
          )
        : "Select a CV (PDF or Word) and/or certificate files (PDF, Word, JPG, PNG).";
    return {
      blocked: true,
      acceptedCv: false,
      acceptedCertCount: 0,
      rejected,
      phase: null,
      activeStatus: null,
      error,
    };
  }

  const phase = acceptedCv ? "cv" : "certs";
  return {
    blocked: false,
    acceptedCv,
    acceptedCertCount,
    rejected,
    phase,
    activeStatus: phase === "cv" ? CV_PROCESSING_STATUS : CERT_UPLOAD_STATUS,
    error: null,
  };
}

/**
 * Chat line asking Hermes to process uploads.
 * Only a CV that was actually stored gets one. Rejected files never do.
 */
export function processRequestText(input: { cvName: string | null; certNames: string[] }): string | null {
  const cvName = input.cvName?.trim() ?? "";
  if (!cvName) return null;
  if (input.certNames.length === 0) return `Please process this CV PDF: ${cvName}`;
  return `Please process these files: ${[cvName, ...input.certNames].join(", ")}`;
}

export type WorkspaceUploadWorkResult = {
  cvStored: boolean;
  cvProcessed: boolean;
  cvName?: string | null;
  storedCertCount: number;
  failures: string[];
  timedOut?: boolean;
  requestFailed?: boolean;
  requestError?: string | null;
  /** Shown with a successful CV read, for example when publish is still blocked. */
  noticeError?: string | null;
};

export type WorkspaceUploadSettlement = {
  uploading: false;
  phase: null;
  activeStatus: null;
  error: string | null;
  /** Appended to the chat after the busy flag is cleared, so a history reload cannot wipe it first. */
  agentError: string | null;
  cvUpdatedLabel: "CV upload" | "Certificate files" | null;
  reloadAfterIdle: boolean;
  /** True only when a stored CV was sent for processing. */
  announcedProcess: boolean;
};

export function settleWorkspaceUpload(input: WorkspaceUploadWorkResult): WorkspaceUploadSettlement {
  const announcedProcess = Boolean(input.cvStored && input.cvName?.trim());
  const parts: string[] = [];
  if (input.timedOut) {
    parts.push(input.requestError?.trim() || CV_PROCESS_TIMEOUT_MESSAGE);
  } else if (input.requestFailed) {
    parts.push(input.requestError?.trim() || UPLOAD_REQUEST_FAILED_MESSAGE);
  } else if (input.requestError?.trim()) {
    parts.push(input.requestError.trim());
  }
  if (input.failures.length > 0) {
    parts.push(
      input.cvStored && input.storedCertCount === 0
        ? `Failed: ${input.failures.join(" ")}`
        : formatStoredFailure(input.storedCertCount, input.failures),
    );
  }
  if (input.noticeError?.trim()) parts.push(input.noticeError.trim());
  const error = parts.length > 0 ? parts.join(" ") : null;

  const cvUpdatedLabel = input.cvProcessed
    ? "CV upload"
    : input.storedCertCount > 0
      ? "Certificate files"
      : null;

  return {
    uploading: false,
    phase: null,
    activeStatus: null,
    error,
    agentError: error,
    cvUpdatedLabel,
    reloadAfterIdle: Boolean(input.cvProcessed || input.cvStored || input.storedCertCount > 0),
    announcedProcess,
  };
}

export function failureMessageFromUnknown(error: unknown): { message: string; timedOut: boolean } {
  return { message: messageFromUploadError(error), timedOut: isUploadTimeoutError(error) };
}

export type WorkspaceUploadBusy = {
  uploading: true;
  phase: "cv" | "certs";
  status: typeof CV_PROCESSING_STATUS | typeof CERT_UPLOAD_STATUS;
};

/**
 * Runs an upload and always clears the busy flag before any follow-up reload.
 * A reload that never resolves cannot leave the button on "Uploading…".
 * A blocked start never flips the busy flag on.
 */
export async function runWorkspaceUploadSession<T extends WorkspaceUploadWorkResult>(input: {
  start: WorkspaceUploadStart;
  onBusy: (busy: WorkspaceUploadBusy) => void;
  onIdle: () => void;
  work: () => Promise<T>;
  onSettled?: (settlement: WorkspaceUploadSettlement) => void;
  reload?: (settlement: WorkspaceUploadSettlement) => Promise<void>;
}): Promise<{ result?: T; settlement: WorkspaceUploadSettlement }> {
  if (input.start.blocked || !input.start.phase || !input.start.activeStatus) {
    input.onIdle();
    const settlement = settleWorkspaceUpload({
      cvStored: false,
      cvProcessed: false,
      storedCertCount: 0,
      failures: input.start.rejected.map((item) => `${item.name}: ${item.message}`),
      cvName: null,
    });
    return { settlement: { ...settlement, error: input.start.error, agentError: input.start.error } };
  }

  input.onBusy({
    uploading: true,
    phase: input.start.phase,
    status: input.start.activeStatus,
  });

  let result: T;
  try {
    result = await input.work();
  } finally {
    input.onIdle();
  }

  const settlement = settleWorkspaceUpload(result);
  input.onSettled?.(settlement);
  if (settlement.reloadAfterIdle && input.reload) {
    await input.reload(settlement);
  }
  return { result, settlement };
}
