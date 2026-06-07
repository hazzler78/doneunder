"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  initialStatus: "draft" | "published";
  publishedAt?: string | null;
};

export function PublishProfileButton({ initialStatus, publishedAt }: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [publishedLabel, setPublishedLabel] = useState(publishedAt);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onPublish() {
    setLoading(true);
    setMessage(null);

    const response = await fetch("/api/diver/profile/publish", { method: "POST" });
    const data = (await response.json()) as {
      ok?: boolean;
      error?: string;
      validation?: { errors: string[]; warnings: string[] };
    };

    setLoading(false);

    if (!response.ok) {
      const details = data.validation?.errors?.length
        ? ` ${data.validation.errors.join(" ")}`
        : data.validation?.warnings?.length
          ? ` ${data.validation.warnings.join(" ")}`
          : "";
      setMessage(`${data.error ?? "Publish failed."}${details}`);
      return;
    }

    setStatus("published");
    setPublishedLabel(new Date().toISOString());
    setMessage("Profile published. Your ambassador page is now publicly visible.");
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border/70 bg-muted/20 p-3">
      <div className="text-sm">
        <p>
          Public status: <span className="text-cyan-200">{status}</span>
        </p>
        {publishedLabel ? (
          <p className="text-xs text-muted-foreground">
            Published {new Date(publishedLabel).toLocaleString("en-GB")}
          </p>
        ) : null}
      </div>
      <Button type="button" size="sm" onClick={onPublish} disabled={loading || status === "published"}>
        {status === "published" ? "Published" : loading ? "Publishing..." : "Publish profile"}
      </Button>
      {message ? <p className="w-full text-xs text-amber-300">{message}</p> : null}
    </div>
  );
}
