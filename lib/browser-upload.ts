export type CertificateUploadAction = "added" | "renewed" | "duplicate";

export type CertificateUploadItem = {
  name: string;
  action: CertificateUploadAction;
};

async function compressImageIfNeeded(file: File): Promise<File> {
  const isImage =
    /^image\/(jpeg|jpg|png|webp)$/i.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!isImage || file.size <= 1_200_000) return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 1800;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    bitmap.close();
    if (!blob || blob.size === 0) return file;
    const name = file.name.replace(/\.[a-z0-9]+$/i, ".jpg");
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export async function uploadCertificateFilesSequentially(
  files: File[],
  onProgress?: (current: number, total: number, fileName: string) => void,
) {
  const uploaded: CertificateUploadItem[] = [];
  const errors: string[] = [];

  for (const [index, original] of files.entries()) {
    onProgress?.(index + 1, files.length, original.name);
    const file = await compressImageIfNeeded(original);
    const form = new FormData();
    form.append("certificates", file);
    const response = await fetch("/api/diver/documents", {
      method: "POST",
      body: form,
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      uploaded?: CertificateUploadItem[];
    };
    if (!response.ok) {
      errors.push(`${original.name}: ${data.error ?? "upload failed"}`);
      continue;
    }
    uploaded.push(...(data.uploaded ?? [{ name: original.name, action: "added" }]));
  }

  if (uploaded.length > 0) {
    await fetch("/api/diver/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complete: true, files: uploaded }),
    });
  }

  return { uploaded, errors };
}
