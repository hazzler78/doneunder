"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { clampFocalY, readAvatarFocalY, withAvatarFocalY } from "@/lib/avatar-focal";

type Props = {
  currentUrl?: string | null;
  onUploaded?: (url: string) => void;
};

export function AmbassadorPhotoUpload({ currentUrl, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [focalY, setFocalY] = useState(() => readAvatarFocalY(currentUrl));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPreview(currentUrl ?? null);
    setFocalY(readAvatarFocalY(currentUrl));
  }, [currentUrl]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  async function onFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    const local = URL.createObjectURL(file);
    setPreview(local);

    const form = new FormData();
    form.append("avatar", file);
    form.append("fy", String(focalY));
    const response = await fetch("/api/diver/avatar", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setMessage(data.error ?? "Upload failed.");
      setPreview(currentUrl ?? null);
      return;
    }

    const nextUrl = typeof data.avatarUrl === "string" ? data.avatarUrl : local;
    setPreview(nextUrl);
    setMessage("Photo saved. Use the slider if you need to frame your face.");
    onUploaded?.(nextUrl);
  }

  function onFocalChange(next: number) {
    const fy = clampFocalY(next);
    setFocalY(fy);
    if (!preview || preview.startsWith("blob:")) return;

    const nextUrl = withAvatarFocalY(preview, fy);
    setPreview(nextUrl);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setBusy(true);
      const response = await fetch("/api/diver/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fy }),
      });
      const data = await response.json().catch(() => ({}));
      setBusy(false);
      if (!response.ok) {
        setMessage(data.error ?? "Could not save framing.");
        return;
      }
      if (typeof data.avatarUrl === "string") {
        setPreview(data.avatarUrl);
        onUploaded?.(data.avatarUrl);
      }
      setMessage("Framing saved.");
    }, 350);
  }

  return (
    <div className="rounded-xl border border-border/70 bg-card/80 p-4">
      <p className="text-sm font-medium text-heading">Business card photo</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Clear head-and-shoulders shot. Drag the slider so your face sits in the circle.
      </p>

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="relative h-36 w-36 overflow-hidden rounded-full border border-border bg-surface-muted shadow-sm">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Your card photo"
              className="h-full w-full object-cover"
              style={{ objectPosition: `50% ${focalY}%` }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              No photo
            </div>
          )}
        </div>

        <div className="w-full min-w-0 flex-1 space-y-3">
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
            {busy ? "Saving…" : preview ? "Change photo" : "Add photo"}
          </Button>

          {preview ? (
            <label className="block space-y-1.5">
              <span className="flex justify-between text-xs text-muted-foreground">
                <span>Move photo</span>
                <span>up ↔ down</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={focalY}
                disabled={busy || preview.startsWith("blob:")}
                onChange={(event) => onFocalChange(Number(event.target.value))}
                className="w-full accent-primary"
              />
            </label>
          ) : null}

          {message ? <p className="text-xs text-heading-muted">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}
