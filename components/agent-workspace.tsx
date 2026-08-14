"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FileText, LogOut, Paperclip, PanelLeft, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/auth/actions";
import { isStoredMainCvFilename, looksLikeMainCvFilename } from "@/lib/document-names";
import type { UserRole } from "@/lib/types";

type ChatResponse = {
  ok: boolean;
  reply: string;
  role: UserRole;
  suggestions?: Array<{
    id: string;
    title: string;
    location: string;
    reason: string;
    score: number;
  }>;
  profileStatus?: "draft" | "published";
  cvUpdated?: boolean;
  updatedParts?: string[];
};

type DocumentEntry = {
  name: string;
  path: string;
  created_at: string;
  size: number;
};

type LivingCvInfo = {
  present: boolean;
  updatedAt: string | null;
};

type Props = {
  role: Exclude<UserRole, "admin">;
  userId: string;
  displayName: string;
  username: string | null;
};

type Message = {
  id: string;
  from: "user" | "agent";
  text: string;
};

type StoredChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type PendingInboundNotice = {
  from: string;
  subject: string;
  intent: "certificates" | "general";
  status: "pending";
};

const diverStarterPrompts = [
  "How does my CV look?",
  "Add this job to my CV: North Sea IRM, air diver, 2024–2025",
  "Set my sat hours to 2100 and say I'm available on short notice",
  "Rewrite my summary in clearer English",
];

const companyStarterPrompts = [
  "Find top 3 candidates for IMCA + NDT.",
  "Draft a job request for offshore wind inspection.",
  "Screen candidates available in 7 days.",
];

export function AgentWorkspace({ role, userId, displayName, username }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<ChatResponse["suggestions"]>([]);
  const [profileStatus, setProfileStatus] = useState<"draft" | "published">("draft");
  const [documents, setDocuments] = useState<DocumentEntry[]>([]);
  const [livingCv, setLivingCv] = useState<LivingCvInfo>({ present: false, updatedAt: null });
  const [docLoading, setDocLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [mainCv, setMainCv] = useState<File | null>(null);
  const [certs, setCerts] = useState<File[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [cvUpdatedParts, setCvUpdatedParts] = useState<string[]>([]);
  const [pendingInbound, setPendingInbound] = useState<PendingInboundNotice | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const starters = useMemo(
    () => (role === "diver" ? diverStarterPrompts : companyStarterPrompts),
    [role],
  );

  useEffect(() => {
    void loadChatHistory();
    if (role === "diver") {
      void loadDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  useEffect(() => {
    if (role !== "diver") return;
    const timer = window.setInterval(() => {
      if (sending) return;
      void loadChatHistory({ silent: true });
    }, 10000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, sending]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function loadChatHistory(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setHistoryLoading(true);
    }
    try {
      const response = await fetch("/api/chat/messages");
      const data = (await response.json()) as {
        messages?: StoredChatMessage[];
        pendingInbound?: PendingInboundNotice | null;
      };
      if (response.ok) {
        setPendingInbound(data.pendingInbound?.status === "pending" ? data.pendingInbound : null);
      }
      if (!response.ok || !data.messages?.length) {
        if (!options?.silent) {
          setMessages([
            {
              id: "welcome",
              from: "agent",
              text:
                role === "diver"
                  ? "Hi — I'm Hermes. Update your CV just by talking, in English. Tell me a job to add, a ticket to list, hours to change, or paste CV text. I'll save it for you."
                  : "Welcome. I can help draft job requests and shortlist matching diver profiles.",
            },
          ]);
        }
        return;
      }

      const next = data.messages.map((item) => ({
        id: item.id,
        from: (item.role === "user" ? "user" : "agent") as Message["from"],
        text: item.content,
      }));
      setMessages((prev) => {
        const lastPrev = prev[prev.length - 1];
        const lastNext = next[next.length - 1];
        if (prev.length === next.length && lastPrev?.id === lastNext?.id && lastPrev?.text === lastNext?.text) {
          return prev;
        }
        return next;
      });
    } catch {
      if (!options?.silent) {
        setMessages([
          {
            id: "welcome",
            from: "agent",
            text: "Could not load previous chat history. You can still send a new message.",
          },
        ]);
      }
    } finally {
      if (!options?.silent) {
        setHistoryLoading(false);
      }
    }
  }

  async function loadDocuments() {
    if (role !== "diver") return;
    setDocLoading(true);
    try {
      const response = await fetch("/api/diver/documents");
      const data = (await response.json()) as {
        documents?: DocumentEntry[];
        certificates?: DocumentEntry[];
        livingCv?: LivingCvInfo;
      };
      if (response.ok) {
        setDocuments(data.certificates ?? data.documents ?? []);
        if (data.livingCv) setLivingCv(data.livingCv);
      }
    } finally {
      setDocLoading(false);
    }
  }

  async function sendMessage(text: string) {
    if (!text.trim()) return;
    setSending(true);
    const userMsg: Message = { id: crypto.randomUUID(), from: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = (await response.json()) as ChatResponse;

      if (!response.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            from: "agent",
            text: data.reply || "Could not process this request.",
          },
        ]);
        return;
      }

      setMessages((prev) => [...prev, { id: crypto.randomUUID(), from: "agent", text: data.reply }]);
      setSuggestions(data.suggestions ?? []);
      if (data.profileStatus) setProfileStatus(data.profileStatus);
      if (data.cvUpdated) {
        setCvUpdatedParts(data.updatedParts?.length ? data.updatedParts : ["CV"]);
      }
      void loadChatHistory({ silent: true });
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          from: "agent",
          text: "Network error while contacting the agent.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  const hasStoredCv = livingCv.present || documents.some((doc) => isStoredMainCvFilename(doc.name));

  function classifyDroppedFiles(files: File[]) {
    const cvFile = files.find((file) => looksLikeMainCvFilename(file.name)) ?? null;
    return {
      cvFile,
      certFiles: files.filter((file) => file !== cvFile),
    };
  }

  async function processCvUpload(fileOverride?: File | File[]) {
    const dropped = fileOverride ? (Array.isArray(fileOverride) ? fileOverride : [fileOverride]) : [];
    const classified = dropped.length > 0 ? classifyDroppedFiles(dropped) : { cvFile: mainCv, certFiles: certs };
    const cvFile = classified.cvFile;
    const certFiles = classified.certFiles;
    if (!cvFile && certFiles.length === 0) {
      setUploadError("Select a CV PDF and/or certificate files (PDF, JPG, PNG).");
      return;
    }
    setUploading(true);
    setUploadError(null);
    if (dropped.length > 0) {
      const names = dropped.map((file) => file.name).join(", ");
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          from: "user",
          text: cvFile && certFiles.length === 0 ? `Please process this CV PDF: ${cvFile.name}` : `Please store these files: ${names}`,
        },
      ]);
    }
    const form = new FormData();
    if (cvFile) form.append("mainCv", cvFile);
    certFiles.forEach((file) => form.append("certificates", file));

    try {
      const response = await fetch("/api/diver/profile/process-cv", {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as {
        error?: string;
        detail?: string;
        warnings?: string[];
      };
      if (!response.ok) {
        const detail = data.detail ? ` ${data.detail}` : "";
        const message = `${data.error ?? "Failed to process CV upload."}${detail}`;
        setUploadError(message);
        if (fileOverride) {
          setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), from: "agent", text: message },
          ]);
        }
        return;
      }
      setMainCv(null);
      setCerts([]);
      setCvUpdatedParts([cvFile ? "CV upload" : "Certificate files"]);
      await loadDocuments();
      await loadChatHistory({ silent: true });
    } catch {
      setUploadError("Upload request failed.");
      if (fileOverride) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            from: "agent",
            text: "Upload request failed. Please try attaching the files again.",
          },
        ]);
      }
    } finally {
      setUploading(false);
    }
  }

  const sidePanel = (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-lg font-semibold text-cyan-50">Workspace</p>
          <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-medium capitalize text-primary">
            {role}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{displayName}</p>
      </div>

      <div className="rounded-xl border border-border/60 bg-[#050f18] p-3 text-xs text-muted-foreground">
        <p>Account · {userId.slice(0, 8)}…</p>
        {username ? <p className="mt-1">Public · @{username}</p> : null}
        {role === "diver" ? (
          <p className="mt-1">
            Profile · <span className="capitalize text-cyan-200">{profileStatus}</span>
          </p>
        ) : null}
        {role === "diver" ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/preview" target="_blank">
              <Button size="sm" variant="outline">
                Preview page
              </Button>
            </Link>
            <Link href="/preview/cv" target="_blank">
              <Button size="sm" variant="outline">
                Preview CV
              </Button>
            </Link>
          </div>
        ) : null}
      </div>

      {role === "diver" ? (
        <div className="space-y-2 rounded-xl border border-border/60 bg-[#050f18] p-3">
          <p className="text-sm font-medium text-cyan-50">Upload CV & certificates</p>
          <p className="text-[11px] text-muted-foreground">
            {hasStoredCv
              ? "Hermes already keeps your living CV. Add a new or renewed certificate scan — no new CV file needed."
              : "Upload a CV once to seed Hermes. After that, talk to Hermes to update it. Certificates are stored separately."}
          </p>
          <label className="block space-y-1">
            <span className="text-[11px] text-muted-foreground">
              {hasStoredCv ? "Replace living CV from a new PDF (rare)" : "Seed CV (PDF)"}
            </span>
            <input
              type="file"
              accept="application/pdf"
              onChange={(event) => setMainCv(event.target.files?.[0] ?? null)}
              className="w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:text-cyan-50"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-muted-foreground">Certificates</span>
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              multiple
              onChange={(event) => setCerts(Array.from(event.target.files ?? []))}
              className="w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:text-cyan-50"
            />
          </label>
          <Button
            size="sm"
            className="w-full"
            onClick={() => void processCvUpload()}
            disabled={uploading || (!mainCv && certs.length === 0)}
          >
            {uploading ? "Processing…" : mainCv ? "Process files" : "Store certificates"}
          </Button>
          {uploadError ? <p className="text-xs text-amber-300">{uploadError}</p> : null}
        </div>
      ) : null}

      <div className="space-y-2 rounded-xl border border-border/60 bg-[#050f18] p-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-medium text-cyan-50">
            <FileText className="h-3.5 w-3.5" />
            Files
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={loadDocuments}
            disabled={docLoading || role !== "diver"}
          >
            {docLoading ? "…" : "Refresh"}
          </Button>
        </div>
        {role !== "diver" ? (
          <p className="text-xs text-muted-foreground">Company files panel coming next.</p>
        ) : !livingCv.present && documents.length === 0 ? (
          <p className="text-xs text-muted-foreground">No living CV or certificates yet.</p>
        ) : (
          <ul className="space-y-2">
            {livingCv.present ? (
              <li className="rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2 text-xs">
                <p className="font-medium text-cyan-50">Living CV</p>
                <p className="text-muted-foreground">
                  Hermes keeps this updated
                  {livingCv.updatedAt ? ` · ${new Date(livingCv.updatedAt).toLocaleString("en-GB")}` : ""}
                </p>
              </li>
            ) : null}
            {documents.map((doc) => (
              <li key={doc.path} className="rounded-lg border border-border/50 px-2.5 py-2 text-xs">
                <p className="font-medium text-cyan-50">{doc.name}</p>
                <p className="text-muted-foreground">
                  Certificate
                  {doc.created_at ? ` · ${new Date(doc.created_at).toLocaleString("en-GB")}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative mx-auto flex h-[calc(100dvh-3.75rem)] w-full max-w-7xl overflow-hidden lg:h-[calc(100dvh-4rem)]">
      {/* Desktop side panel */}
      <aside className="hidden w-[300px] shrink-0 border-r border-border/50 bg-[#050b12]/80 lg:block xl:w-[320px]">
        {sidePanel}
      </aside>

      {/* Mobile panel overlay */}
      {panelOpen ? (
        <div className="absolute inset-0 z-30 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label="Close panel"
            onClick={() => setPanelOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[min(100%,320px)] border-r border-border/50 bg-[#050b12] shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
              <p className="text-sm font-medium text-cyan-50">Workspace</p>
              <button
                type="button"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-cyan-50"
                onClick={() => setPanelOpen(false)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {sidePanel}
          </aside>
        </div>
      ) : null}

      {/* Chat main */}
      <section className="flex min-w-0 flex-1 flex-col bg-[#03070d]">
        <div className="flex items-center justify-between gap-3 border-b border-border/50 px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 text-cyan-100 lg:hidden"
              onClick={() => setPanelOpen(true)}
              aria-label="Open workspace panel"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              H
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-cyan-50">Hermes</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {role === "diver" ? "Talk to update your CV" : "Recruitment agent"} ·{" "}
                <span className="text-success">Online</span>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {role === "diver" ? (
              <span className="hidden rounded-md border border-border/60 px-2 py-1 text-[11px] capitalize text-muted-foreground sm:inline">
                Profile {profileStatus}
              </span>
            ) : null}
            <Link href="/" className="hidden sm:inline">
              <Button type="button" size="sm" variant="outline">
                Close
              </Button>
            </Link>
            <form action={logoutAction}>
              <Button type="submit" size="sm" variant="ghost" aria-label="Sign out">
                <LogOut className="h-4 w-4" />
                <span className="ml-1.5 hidden md:inline">Sign out</span>
              </Button>
            </form>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5">
          {historyLoading ? (
            <p className="text-sm text-muted-foreground">Loading conversation…</p>
          ) : (
            <>
              {pendingInbound ? (
                <div className="rounded-xl border border-primary/35 bg-primary/10 px-3.5 py-3 text-sm text-cyan-50">
                  <p className="font-medium">You have a new email</p>
                  <p className="mt-1 text-cyan-50/90">
                    From {pendingInbound.from}
                    {pendingInbound.subject ? ` — ${pendingInbound.subject}` : ""}.
                    {pendingInbound.intent === "certificates"
                      ? " They asked for your certificates. Reply yes and I will send them."
                      : " Reply here if you want me to follow up."}
                  </p>
                </div>
              ) : null}
              {messages.length <= 1 ? (
                <div className="mb-3 space-y-3">
                  {role === "diver" ? (
                    <div className="rounded-xl border border-border/60 bg-[#07111c] px-3.5 py-3 text-sm text-muted-foreground">
                      <p className="font-medium text-cyan-50">Update your CV in this chat</p>
                      <p className="mt-1">
                        Type a change, paste CV text, or attach a PDF. Everything is saved in English.
                      </p>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {starters.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        disabled={sending || uploading}
                        onClick={() => sendMessage(starter)}
                        className="rounded-full border border-border/60 bg-[#07111c] px-3 py-1.5 text-left text-xs text-cyan-100/90 transition hover:border-primary/40 hover:bg-muted/40 disabled:opacity-50"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {messages.map((item) => (
                <div
                  key={item.id}
                  className={
                    item.from === "user"
                      ? "ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-[#0d3a4a] px-3.5 py-2.5 text-sm text-cyan-50 sm:max-w-[75%]"
                      : "max-w-[92%] rounded-2xl rounded-bl-md border border-border/55 bg-[#07111c] px-3.5 py-2.5 text-sm text-cyan-50/95 sm:max-w-[80%]"
                  }
                >
                  {item.from === "agent" ? (
                    <p className="mb-1 text-[11px] font-medium text-primary/80">Hermes</p>
                  ) : null}
                  <p className="whitespace-pre-wrap leading-relaxed">{item.text}</p>
                </div>
              ))}

              {sending || uploading ? (
                <div className="max-w-[80%] rounded-2xl rounded-bl-md border border-border/55 bg-[#07111c] px-3.5 py-2.5 text-sm text-muted-foreground">
                  <p className="mb-1 text-[11px] font-medium text-primary/80">Hermes</p>
                  <p className="animate-pulse-soft">{uploading ? "Processing your CV…" : "Thinking…"}</p>
                </div>
              ) : null}

              {suggestions && suggestions.length > 0 ? (
                <div className="space-y-2 rounded-xl border border-border/60 bg-[#07111c]/80 p-3">
                  <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                    Job matches
                  </p>
                  {suggestions.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-border/50 bg-[#050f18] px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-cyan-50">{item.title}</p>
                          <p className="text-[11px] text-muted-foreground">{item.location}</p>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-success">
                          {item.score}%
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">{item.reason}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {cvUpdatedParts.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success/25 bg-success/10 px-3 py-2.5 text-sm text-cyan-50">
                  <p>
                    Saved to your CV
                    {cvUpdatedParts[0] === "CV upload"
                      ? " from your PDF."
                      : `: ${cvUpdatedParts.map((part) => part.replaceAll("_", " ")).join(", ")}.`}
                  </p>
                  <Link href="/preview/cv" target="_blank" className="text-xs font-medium text-primary hover:underline">
                    Preview CV
                  </Link>
                </div>
              ) : null}

              <div ref={bottomRef} />
            </>
          )}
        </div>

        <form
          className="border-t border-border/50 bg-[#050b12]/90 p-3 sm:p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage(input);
          }}
        >
          <div className="flex items-end gap-2 rounded-2xl border border-border/60 bg-[#07111c] p-2 focus-within:border-primary/40">
            {role === "diver" ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = "";
                    if (files.length > 0) void processCvUpload(files);
                  }}
                />
                <button
                  type="button"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-cyan-100/80 transition hover:bg-muted/50 hover:text-cyan-50 disabled:opacity-50"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || sending}
                  aria-label="Attach CV or certificates"
                  title="Attach CV PDF and/or certificate photos"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
              </>
            ) : null}
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage(input);
                }
              }}
              rows={1}
              className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-cyan-50 outline-none placeholder:text-muted-foreground"
              placeholder={
                role === "diver"
                  ? "Tell Hermes what to change on your CV…"
                  : "Message Hermes…"
              }
            />
            <Button
              type="submit"
              size="sm"
              disabled={sending || uploading || !input.trim()}
              className="h-10 w-10 shrink-0 rounded-xl p-0"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            {role === "diver"
              ? hasStoredCv
                ? "English · Attach certificate PDFs/photos, or type a CV change"
                : "English · Type a change, or attach a CV PDF plus certificate PDFs/photos"
              : "Enter to send · Shift+Enter for a new line"}
          </p>
        </form>
      </section>
    </div>
  );
}
