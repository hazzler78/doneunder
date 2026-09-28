"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  currentUrl?: string | null;
  onUploaded?: (url: string) => void;
};

export function AmbassadorPhotoUpload({ currentUrl, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    const local = URL.createObjectURL(file);
    setPreview(local);

    const form = new FormData();
    form.append("avatar", file);
    const response = await fetch("/api/diver/avatar", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setMessage(data.error ?? "Upload failed.");
      setPreview(currentUrl ?? null);
      return;
    }

    setPreview(data.avatarUrl ?? local);
    setMessage("Photo saved — refreshing your card…");
    if (typeof data.avatarUrl === "string") onUploaded?.(data.avatarUrl);
    window.location.reload();
  }

  return (
    <div className="rounded-xl border border-border/70 bg-card/80 p-4">
      <p className="text-sm font-medium text-heading">Business card photo</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Clear head-and-shoulders shot. JPG, PNG or WebP, under 5 MB.
      </p>
      <div className="mt-3 flex items-center gap-4">
        <div className="relative h-20 w-20 overflow-hidden rounded-full border border-border bg-surface-muted">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Your card photo" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              No photo
            </div>
          )}
        </div>
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => onFile(event.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Uploading…" : preview ? "Change photo" : "Add photo"}
          </Button>
          {message ? <p className="text-xs text-heading-muted">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}
