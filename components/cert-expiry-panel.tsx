"use client";

import { useEffect, useState } from "react";
import { certExpiryLabel, certExpiryStatus, daysUntilExpiry, DEFAULT_LEAD_DAYS } from "@/lib/cert-expiry";
import { Button } from "@/components/ui/button";

type CertRow = {
  id: string;
  name: string;
  expiry_date: string | null;
  expiry_confirmed?: boolean | null;
};

type Props = {
  reloadKey?: number;
};

export function CertExpiryPanel({ reloadKey = 0 }: Props) {
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(true);
  const [leadDays, setLeadDays] = useState(String(DEFAULT_LEAD_DAYS));
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [profileRes, settingsRes] = await Promise.all([
          fetch("/api/diver/profile"),
          fetch("/api/diver/reminder-settings"),
        ]);
        const profile = (await profileRes.json()) as { certifications?: CertRow[]; error?: string };
        const settings = (await settingsRes.json()) as { enabled?: boolean; leadDays?: number; error?: string };
        if (cancelled) return;
        if (!profileRes.ok) {
          setMessage(profile.error || "Could not load certificates.");
          return;
        }
        const rows = profile.certifications ?? [];
        setCerts(rows);
        setDrafts(Object.fromEntries(rows.map((cert) => [cert.id, cert.expiry_date ?? ""])));
        if (settingsRes.ok) {
          setEnabled(settings.enabled !== false);
          setLeadDays(String(settings.leadDays ?? DEFAULT_LEAD_DAYS));
        }
        setMessage(null);
      } catch {
        if (!cancelled) setMessage("Could not load certificates.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function saveCert(cert: CertRow, confirmOnly = false) {
    setSavingId(cert.id);
    setMessage(null);
    const expiry = (drafts[cert.id] ?? "").trim();
    try {
      const response = await fetch(`/api/diver/certifications/${cert.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expiry_date: expiry || null,
          ...(confirmOnly ? { confirm: true } : {}),
        }),
      });
      const data = (await response.json()) as { certification?: CertRow; error?: string };
      if (!response.ok || !data.certification) {
        setMessage(data.error || "Could not save that date.");
        return;
      }
      setCerts((prev) => prev.map((item) => (item.id === cert.id ? { ...item, ...data.certification } : item)));
      setDrafts((prev) => ({ ...prev, [cert.id]: data.certification?.expiry_date ?? "" }));
    } catch {
      setMessage("Could not save that date.");
    } finally {
      setSavingId(null);
    }
  }

  async function saveSettings() {
    const parsed = Number(leadDays);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
      setMessage("Choose between 1 and 365 days.");
      return;
    }
    setSavingSettings(true);
    setMessage(null);
    try {
      const response = await fetch("/api/diver/reminder-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, leadDays: parsed }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(data.error || "Could not save reminder settings.");
        return;
      }
      setMessage("Reminder settings saved.");
    } catch {
      setMessage("Could not save reminder settings.");
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card p-3">
      <div>
        <p className="text-sm font-medium text-heading">Certificates</p>
        <p className="text-[11px] text-muted-foreground">
          Set an expiry date for each ticket. Hermes fills dates from a CV or scan, and you confirm them.
        </p>
      </div>

      {loading ? <p className="text-xs text-muted-foreground">Loading certificates…</p> : null}

      {!loading && certs.length === 0 ? (
        <p className="text-xs text-muted-foreground">No certificates on the profile yet.</p>
      ) : null}

      <ul className="space-y-2">
        {certs.map((cert) => {
          const draft = drafts[cert.id] ?? "";
          const status = certExpiryStatus(daysUntilExpiry(draft || null), Number(leadDays) || DEFAULT_LEAD_DAYS);
          const label = certExpiryLabel(status);
          const unconfirmed = cert.expiry_confirmed === false && Boolean(draft);
          return (
            <li key={cert.id} className="space-y-1.5 rounded-lg border border-border/50 px-2.5 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-heading">{cert.name}</p>
                {label ? (
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                      status === "expired"
                        ? "bg-red-500/15 text-red-800 dark:text-red-300"
                        : "bg-amber-500/15 text-amber-900 dark:text-amber-200"
                    }`}
                  >
                    {label}
                  </span>
                ) : null}
              </div>
              <label className="block text-[11px] text-muted-foreground">
                Expiry date
                <input
                  type="date"
                  value={draft}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [cert.id]: event.target.value }))}
                  className="mt-1 w-full rounded-md border bg-transparent p-1.5 text-xs text-heading"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={savingId === cert.id}
                  onClick={() => void saveCert(cert)}
                >
                  {savingId === cert.id ? "Saving…" : "Save date"}
                </Button>
                {unconfirmed ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={savingId === cert.id}
                    onClick={() => void saveCert(cert, true)}
                  >
                    Confirm
                  </Button>
                ) : null}
              </div>
              {unconfirmed ? (
                <p className="text-[11px] text-amber-800 dark:text-amber-300">Read from a file. Confirm or correct it.</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="space-y-2 border-t border-border/50 pt-3">
        <label className="flex items-center gap-2 text-xs text-heading">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Email me before a certificate expires
        </label>
        <label className="block text-[11px] text-muted-foreground">
          First reminder, days before expiry
          <input
            type="number"
            min={1}
            max={365}
            value={leadDays}
            onChange={(event) => setLeadDays(event.target.value)}
            className="mt-1 w-24 rounded-md border bg-transparent p-1.5 text-xs text-heading"
          />
        </label>
        <p className="text-[11px] text-muted-foreground">Also emails 7 days before and on the expiry day. Default 30.</p>
        <Button type="button" size="sm" variant="outline" disabled={savingSettings} onClick={() => void saveSettings()}>
          {savingSettings ? "Saving…" : "Save reminders"}
        </Button>
      </div>

      {message ? <p className="text-[11px] text-amber-800 dark:text-amber-300">{message}</p> : null}
    </div>
  );
}
