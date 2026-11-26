/** Shown when CV processing does not finish before the client or route deadline. */
export const CV_PROCESS_TIMEOUT_MESSAGE =
  "Processing your CV timed out. Wait a moment and press Process files again.";

export const UPLOAD_TIMEOUT_MESSAGE =
  "The upload timed out before the server responded. Check your connection and try again.";

export const UPLOAD_REQUEST_FAILED_MESSAGE =
  "Upload request failed. Please try attaching the files again.";

export function isUploadTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: unknown }).name ?? "") : "";
  if (name === "TimeoutError" || name === "AbortError") return true;
  const message = error instanceof Error ? error.message : "";
  return /timed out|timeout/i.test(message);
}

export function messageFromUploadError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (isUploadTimeoutError(error)) return CV_PROCESS_TIMEOUT_MESSAGE;
  return UPLOAD_REQUEST_FAILED_MESSAGE;
}

/**
 * Reject when `work` does not settle in time.
 * A late rejection from `work` is observed here so it does not become an unhandled rejection.
 */
export function withDeadline<T>(work: Promise<T>, ms: number, message = CV_PROCESS_TIMEOUT_MESSAGE): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
