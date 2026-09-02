"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  username: string;
};

export function RequestProfileButton({ username }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onRequest() {
    setLoading(true);
    setMessage(null);
    const response = await fetch("/api/company/profile-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    setLoading(false);

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error ?? "Unable to request profile.");
      return;
    }
    setMessage("Request sent. The diver will be notified in the dashboard.");
  }

  return (
    <div className="space-y-2">
      <Button size="lg" onClick={onRequest} disabled={loading} className="w-full sm:w-auto">
        {loading ? "Sending request..." : "Request full profile and contact"}
      </Button>
      {message ? <p className="text-xs text-heading-muted">{message}</p> : null}
    </div>
  );
}
