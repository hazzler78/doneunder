export const CERT_MAX_BYTES = 10 * 1024 * 1024;
export const CV_MAX_BYTES = 12 * 1024 * 1024;

export const CERT_ACCEPT =
  "application/pdf,.pdf,image/jpeg,image/png,.jpg,.jpeg,.png,image/webp,.webp";

export const CV_ACCEPT = "application/pdf,.pdf";

export function oversizeMessage(fileName: string, maxMb: number) {
  return `${fileName} is too large (max ${maxMb} MB). Try a smaller PDF or compress the scan.`;
}

export function isOversizeCertificate(size: number) {
  return size > CERT_MAX_BYTES;
}

export function isOversizeCv(size: number) {
  return size > CV_MAX_BYTES;
}
