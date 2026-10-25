"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link2, Phone } from "lucide-react";

type ShareLink = {
  id: string;
  recipientEmail: string;
  jobId: string | null;
  companyId: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  active: boolean;
};

type Props = {
  reloadKey?: number;
};

export function DiverProfileSettingsPanel({ reloadKey = 0 }: Props) {
  const [phone, setPhone] = useState("");
  const [phoneSaved, setPhoneSaved] = useState<string | null>(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLinksLoading(true);
    setPhoneError(null);
    try {
      const [contactRes, linksRes] = await Promise.all([
        fetch("/api/diver/contact-settings"),
        fetch("/api/diver/cv-share-links"),
      ]);
      if (contactRes.ok) {
        const contact = (await contactRes.json()) as { phone?: string | null };
        const value = contact.phone ?? "";
        setPhone(value);
        setPhoneSaved(value);
      }
      if (linksRes.ok) {
        const payload = (await linksRes.json()) as { links?: ShareLink[] };
        setLinks(payload.links ?? []);
      }
    } finally {
      setLinksLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function savePhone() {
    setPhoneBusy(true);
    setPhoneError(null);
    try {
      const response = await fetch("/api/diver/contact-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() || null }),
      });
      const payload = (await response.json()) as { error?: string; phone?: string | null };
      if (!response.ok) {
        setPhoneError(payload.error ?? "Could not save.");
        return;
      }
      const saved = payload.phone ?? "";
      setPhone(saved);
      setPhoneSaved(saved);
    } catch {
      setPhoneError("Could not save.");
    } finally {
      setPhoneBusy(false);
    }
  }

  async function revokeLink(id: string) {
    setRevokingId(id);
    try {
      const response = await fetch("/api/diver/cv-share-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (response.ok) {
        setLinks((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, active: false, revokedAt: new Date().toISOString() } : item,
          ),
        );
      }
    } finally {
      setRevokingId(null);
    }
  }

  const phoneDirty = phone !== (phoneSaved ?? "");

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-card p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium text-heading">
        <Phone className="h-3.5 w-3.5" />
        Contact &amp; CV sharing
      </p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Your account email is always used when Hermes applies for jobs. Add an optional phone number for employers.
        Application emails include a private online CV link (about 90 days) — revoke any link here if needed.
      </p>

      <div className="space-y-2">
        <label className="text-xs font-medium text-heading" htmlFor="diver-contact-phone">
          Mobile / phone (optional)
        </label>
        <input
          id="diver-contact-phone"
          type="tel"
          className="w-full rounded-md border border-border/60 bg-transparent px-2 py-1.5 text-sm"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+44 …"
          maxLength={40}
        />
        {phoneError ? <p className="text-xs text-amber-800 dark:text-amber-300">{phoneError}</p> : null}
        <Button size="sm" disabled={phoneBusy || !phoneDirty} onClick={() => void savePhone()}>
          {phoneBusy ? "Saving…" : "Save phone"}
        </Button>
      </div>

      <div className="space-y-2 border-t border-border/50 pt-3">
        <p className="flex items-center gap-1.5 text-xs font-medium text-heading">
          <Link2 className="h-3.5 w-3.5" />
          CV share links
        </p>
        {linksLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : links.length === 0 ? (
          <p className="text-xs text-muted-foreground">No share links yet. Hermes creates one when you apply or send a CV.</p>
        ) : (
          <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
            {links.map((link) => (
              <li key={link.id} className="rounded-lg border border-border/50 px-2.5 py-2">
                <p className="font-medium text-heading">{link.recipientEmail}</p>
                <p className="text-muted-foreground">
                  {link.active ? "Active" : "Revoked or expired"} · expires{" "}
                  {new Date(link.expiresAt).toLocaleDateString("en-GB")}
                </p>
                {link.active ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-[11px]"
                    disabled={revokingId === link.id}
                    onClick={() => void revokeLink(link.id)}
                  >
                    {revokingId === link.id ? "Revoking…" : "Revoke"}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
