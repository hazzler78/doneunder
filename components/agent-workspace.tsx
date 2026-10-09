"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FileText, LogOut, Paperclip, PanelLeft, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/auth/actions";
import { uploadCertificateFilesSequentially } from "@/lib/browser-upload";
import { isStoredMainCvFilename, pickMainCvFile } from "@/lib/document-names";
import { applyPromptForJob, listedJobMatchPrompt } from "@/lib/jobs";
import { FEEDBACK_TELEGRAM_URL, MULTILINGUAL_UPLOAD_HINT } from "@/lib/site";
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
    applied?: boolean;
  }>;
  appliedJobIds?: string[];
  profileStatus?: "draft" | "published";
  needsPhoto?: boolean;
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
  initialMatchPrompt?: string | null;
  /** Prefill chat from CV preview highlight (`/workspace?fix=…`). */
  initialFixPrompt?: string | null;
  schoolOutreachEnabled?: boolean;
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

const diverFirstRunPrompts = ["Match me to open campaigns"];

const garethSchoolOutreachPrompts = [
  "Who should I contact next on the school list?",
  "Mark PDA as contacted — I emailed their careers address today",
  "List UK schools still todo",
  "Draft a short intro email to a diving school about DoneUnder for graduates",
];

const diverStarterPrompts = [
  "How does my CV look?",
  "What should I improve before publishing?",
  "Should I add a photo to my profile?",
  "My papers are not in English — translate and update my CV",
  "Publish my profile",
  "Unpublish my profile",
  "Match me to open campaigns",
  "Add this job to my CV: North Sea IRM, air diver, 2024–2025",
  "Set my sat hours to 2100 and say I'm available on short notice",
];

const companyStarterPrompts = [
  "Find top 3 candidates for IMCA + NDT.",
  "Draft a job request for offshore wind inspection.",
  "Screen candidates available in 7 days.",
];

export function AgentWorkspace({
  role,
  userId,
  displayName,
  username,
  initialMatchPrompt = null,
  initialFixPrompt = null,
  schoolOutreachEnabled = false,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<ChatResponse["suggestions"]>([]);
  const [appliedJobIds, setAppliedJobIds] = useState<string[]>([]);
  const [profileStatus, setProfileStatus] = useState<"draft" | "published">("draft");
  const [documents, setDocuments] = useState<DocumentEntry[]>([]);
  const [livingCv, setLivingCv] = useState<LivingCvInfo>({ present: false, updatedAt: null });
  const [docLoading, setDocLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [suggestPublish, setSuggestPublish] = useState(false);
  const [hasPhoto, setHasPhoto] = useState(true);
  const [suggestPhoto, setSuggestPhoto] = useState(false);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [mainCv, setMainCv] = useState<File | null>(null);
  const [certs, setCerts] = useState<File[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [schoolTargets, setSchoolTargets] = useState<
    Array<{ slug: string; name: string; status: string; priority: number; country: string | null }>
  >([]);
  const [schoolSummary, setSchoolSummary] = useState<Record<string, number> | null>(null);
  const [schoolListLoading, setSchoolListLoading] = useState(false);
  const [cvUpdatedParts, setCvUpdatedParts] = useState<string[]>([]);
  const [pendingInbound, setPendingInbound] = useState<PendingInboundNotice | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const matchSentRef = useRef(false);
  const fixPrefillRef = useRef(false);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const firstRun = role === "diver" && !livingCv.present && documents.length === 0;
  const starters = useMemo(() => {
    if (role === "company") return companyStarterPrompts;
    if (schoolOutreachEnabled) return garethSchoolOutreachPrompts;
    return firstRun ? diverFirstRunPrompts : diverStarterPrompts;
  }, [role, firstRun, schoolOutreachEnabled]);

  async function loadSchoolOutreach() {
    if (!schoolOutreachEnabled) return;
    setSchoolListLoading(true);
    try {
      const response = await fetch("/api/outreach/schools?status=todo");
      const data = (await response.json()) as {
        summary?: { byStatus?: Record<string, number> };
        targets?: Array<{
          slug: string;
          name: string;
          status: string;
          priority: number;
          country: string | null;
        }>;
      };
      if (response.ok && data.targets) {
        setSchoolTargets(data.targets.slice(0, 12));
        setSchoolSummary(data.summary?.byStatus ?? null);
      }
    } finally {
      setSchoolListLoading(false);
    }
  }

  useEffect(() => {
    void loadChatHistory();
    if (role === "diver") {
      void loadDocuments();
    }
    if (schoolOutreachEnabled) {
      void loadSchoolOutreach();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, schoolOutreachEnabled]);

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

  useEffect(() => {
    if (role !== "diver" || !initialMatchPrompt || historyLoading || sending) return;
    if (matchSentRef.current) return;
    matchSentRef.current = true;
    void sendMessage(initialMatchPrompt);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/workspace");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, initialMatchPrompt, historyLoading, sending]);

  useEffect(() => {
    if (role !== "diver" || !initialFixPrompt || historyLoading) return;
    if (fixPrefillRef.current) return;
    fixPrefillRef.current = true;
    setInput(initialFixPrompt);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/workspace");
    }
    window.setTimeout(() => chatInputRef.current?.focus(), 50);
  }, [role, initialFixPrompt, historyLoading]);

  async function loadChatHistory(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setHistoryLoading(true);
    }
    try {
      const response = await fetch("/api/chat/messages");
      const data = (await response.json()) as {
        messages?: StoredChatMessage[];
        pendingInbound?: PendingInboundNotice | null;
        appliedJobIds?: string[];
      };
      if (response.ok) {
        setPendingInbound(data.pendingInbound?.status === "pending" ? data.pendingInbound : null);
        if (data.appliedJobIds) setAppliedJobIds(data.appliedJobIds);
      }
      if (!response.ok || !data.messages?.length) {
        if (!options?.silent) {
          setMessages([
            {
              id: "welcome",
              from: "agent",
              text:
                role === "diver"
                  ? "Hi — I'm Hermes. Attach your CV PDF and ticket photos (any language is fine — I'll save your living CV in English). Then we can match you to open campaigns."
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
        profileStatus?: "draft" | "published";
        hasPhoto?: boolean;
        needsPhoto?: boolean;
      };
      if (response.ok) {
        setDocuments(data.certificates ?? data.documents ?? []);
        if (data.livingCv) setLivingCv(data.livingCv);
        if (data.profileStatus) setProfileStatus(data.profileStatus);
        if (typeof data.hasPhoto === "boolean") setHasPhoto(data.hasPhoto);
        setSuggestPhoto(Boolean(data.needsPhoto) || (data.profileStatus === "published" && data.hasPhoto === false));
        if (
          data.profileStatus !== "published" &&
          (data.livingCv?.present || (data.certificates ?? data.documents ?? []).length > 0)
        ) {
          setSuggestPublish(true);
        }
      }
    } finally {
      setDocLoading(false);
    }
  }

  async function sendMessage(text: string, options?: { display?: string }) {
    if (!text.trim()) return;
    setSending(true);
    const userMsg: Message = { id: crypto.randomUUID(), from: "user", text: options?.display ?? text };
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
      setSuggestions((prev) =>
        data.suggestions && data.suggestions.length > 0 ? data.suggestions : prev,
      );
      if (data.appliedJobIds?.length) {
        setAppliedJobIds((prev) => [...new Set([...prev, ...data.appliedJobIds!])]);
      }
      if (data.profileStatus) setProfileStatus(data.profileStatus);
      if (data.needsPhoto) {
        setSuggestPhoto(true);
        setHasPhoto(false);
      }
      if (data.cvUpdated) {
        setCvUpdatedParts(data.updatedParts?.length ? data.updatedParts : ["CV"]);
      }
      void loadDocuments();
      void loadChatHistory({ silent: true });
      if (schoolOutreachEnabled) void loadSchoolOutreach();
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
    const cvFile = pickMainCvFile(files);
    return {
      cvFile,
      certFiles: files.filter((file) => file !== cvFile),
    };
  }

  async function processCvUpload(fileOverride?: File | File[]) {
    const dropped = fileOverride ? (Array.isArray(fileOverride) ? fileOverride : [fileOverride]) : [];
    const selected = dropped.length > 0 ? dropped : ([mainCv, ...certs].filter(Boolean) as File[]);
    const classified = classifyDroppedFiles(selected);
    const cvFile = classified.cvFile;
    const certFiles = classified.certFiles;
    if (!cvFile && certFiles.length === 0) {
      setUploadError("Select a CV PDF and/or certificate files (PDF, JPG, PNG).");
      setPanelOpen(true);
      return;
    }
    setUploading(true);
    setUploadError(null);
    setUploadNotice(null);
    setSuggestPublish(false);
    if (dropped.length > 0 || selected.length > 0) {
      const names = selected.map((file) => file.name).join(", ");
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          from: "user",
          text: cvFile && certFiles.length === 0 ? `Please process this CV PDF: ${cvFile.name}` : `Please process these files: ${names}`,
        },
      ]);
    }
    try {
      let cvFailed = false;
      if (cvFile) {
        const form = new FormData();
        form.append("mainCv", cvFile);
        for (const cert of certFiles) {
          form.append("certificates", cert);
        }
        const response = await fetch("/api/diver/profile/process-cv", {
          method: "POST",
          body: form,
        });
        const data = (await response.json()) as {
          ok?: boolean;
          error?: string;
          detail?: string;
          warnings?: string[];
          unreadablePdf?: boolean;
          suggestPublish?: boolean;
          profileStatus?: "draft" | "published";
        };
        if (data.unreadablePdf || data.ok === false) {
          cvFailed = true;
          const message =
            data.error ??
            data.warnings?.[0] ??
            "Could not read text from that PDF. File saved — paste CV text in chat or upload a text-based PDF.";
          setUploadError(message);
          setMessages((prev) => [...prev, { id: crypto.randomUUID(), from: "agent", text: message }]);
        } else if (!response.ok) {
          cvFailed = true;
          const message = `${data.error ?? "Failed to process CV upload."}${data.detail ? ` ${data.detail}` : ""}`;
          setUploadError(message);
          if (fileOverride) {
            setMessages((prev) => [...prev, { id: crypto.randomUUID(), from: "agent", text: message }]);
          }
        } else {
          if (data.profileStatus) setProfileStatus(data.profileStatus);
          if (data.suggestPublish || data.profileStatus === "draft") {
            setSuggestPublish(true);
            setPanelOpen(true);
            setUploadNotice("CV processed. Still a draft — tap Publish page when it looks right.");
          }
          if (data.warnings?.length) {
            setUploadNotice((prev) => [prev, ...data.warnings!].filter(Boolean).join(" "));
          }
        }
      }

      if (certFiles.length > 0 && (!cvFile || cvFailed)) {
        const { uploaded, errors } = await uploadCertificateFilesSequentially(
          certFiles,
          (current, total, fileName) => {
            setUploadError(`Uploading ${current} of ${total}: ${fileName}`);
          },
        );
        if (errors.length > 0) {
          const message = `Stored ${uploaded.length} file(s). Failed: ${errors.join(" ")}`;
          setUploadError(message);
          if (fileOverride) {
            setMessages((prev) => [...prev, { id: crypto.randomUUID(), from: "agent", text: message }]);
          }
        } else {
          setUploadError(null);
        }
      }

      setMainCv(null);
      setCerts([]);
      if (cvFile && !cvFailed) {
        setCvUpdatedParts(["CV upload"]);
      } else if (!cvFile) {
        setCvUpdatedParts(["Certificate files"]);
      }
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

  async function setProfileVisibility(next: "published" | "draft") {
    setVisibilityBusy(true);
    setUploadError(null);
    setUploadNotice(null);
    try {
      const response = await fetch(
        next === "published" ? "/api/diver/profile/publish" : "/api/diver/profile/unpublish",
        { method: "POST" },
      );
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        profile?: { profile_status?: "draft" | "published" };
        hasPhoto?: boolean;
        needsPhoto?: boolean;
      };
      if (!response.ok || data.ok === false) {
        setUploadError(data.error ?? (next === "published" ? "Could not publish." : "Could not unpublish."));
        return;
      }
      const status = data.profile?.profile_status ?? next;
      setProfileStatus(status);
      setSuggestPublish(false);
      if (status === "published") {
        const needsPhoto = data.needsPhoto === true || data.hasPhoto === false;
        if (typeof data.hasPhoto === "boolean") setHasPhoto(data.hasPhoto);
        setSuggestPhoto(needsPhoto);
        setUploadNotice(
          needsPhoto
            ? username
              ? `Published at /${username} — add a face photo next (required for a strong page).`
              : "Published — add a face photo next (required for a strong page)."
            : username
              ? `Published. Live at /${username}.`
              : "Published.",
        );
        void loadChatHistory({ silent: true });
      } else {
        setSuggestPhoto(false);
        setUploadNotice(
          "Unpublished. Your public page is offline; @username and previews stay for testing.",
        );
      }
    } catch {
      setUploadError(next === "published" ? "Could not publish." : "Could not unpublish.");
    } finally {
      setVisibilityBusy(false);
    }
  }

  const sidePanel = (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-lg font-semibold text-heading">Workspace</p>
          <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-medium capitalize text-primary">
            {role}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{displayName}</p>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-3 text-xs text-muted-foreground">
        <p>Account · {userId.slice(0, 8)}…</p>
        {username ? <p className="mt-1">Public · @{username}</p> : null}
        {role === "diver" ? (
          <p className="mt-1">
            Profile · <span className="capitalize text-heading-muted">{profileStatus}</span>
          </p>
        ) : null}
        {role === "diver" ? (
          <div className="mt-3 space-y-2">
            {profileStatus === "published" ? (
              <>
                <p className="text-[11px] leading-relaxed">
                  Your page is live{username ? ` at /${username}` : ""}.
                  {!hasPhoto
                    ? " Add a face photo on Preview — without it the page looks unfinished."
                    : " Unpublish to take it offline without losing your username or draft."}
                </p>
                {!hasPhoto ? (
                  <Link href="/preview" target="_blank">
                    <Button size="sm" className="w-full">
                      Add face photo
                    </Button>
                  </Link>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={visibilityBusy || sending}
                  onClick={() => void setProfileVisibility("draft")}
                >
                  {visibilityBusy ? "Working…" : "Unpublish page"}
                </Button>
              </>
            ) : (
              <>
                <p className="text-[11px] leading-relaxed">
                  Draft only — preview works, public URL stays offline until you publish.
                </p>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={visibilityBusy || sending}
                  onClick={() => void setProfileVisibility("published")}
                >
                  {visibilityBusy ? "Working…" : "Publish page"}
                </Button>
              </>
            )}
          </div>
        ) : null}
        {schoolOutreachEnabled ? (
          <div className="mt-3 space-y-2 rounded-lg border border-border/60 bg-card/80 p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-heading">School outreach</p>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => void loadSchoolOutreach()}>
                {schoolListLoading ? "…" : "Refresh"}
              </Button>
            </div>
            {schoolSummary ? (
              <p className="text-[10px] text-muted-foreground">
                todo {schoolSummary.todo ?? 0} · contacted {schoolSummary.contacted ?? 0} · replied{" "}
                {schoolSummary.replied ?? 0} · partner {schoolSummary.partner ?? 0}
              </p>
            ) : null}
            <ul className="max-h-40 space-y-1 overflow-y-auto text-[10px] text-muted-foreground">
              {schoolTargets.length === 0 ? (
                <li>{schoolListLoading ? "Loading…" : "No todo schools — ask Hermes for the full list."}</li>
              ) : (
                schoolTargets.map((t) => (
                  <li key={t.slug} className="truncate">
                    P{t.priority} · {t.name}
                    {t.country ? ` (${t.country})` : ""}
                  </li>
                ))
              )}
            </ul>
            <p className="text-[10px] text-muted-foreground">
              Tell Hermes when you email a school — e.g. “Mark CDT contacted, emailed careers today.”
            </p>
          </div>
        ) : null}
        <a
          href={FEEDBACK_TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-heading hover:bg-primary/15"
        >
          Feedback on Telegram
          <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
            What broke, or what should be easier.
          </span>
        </a>
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
        <div className="space-y-2 rounded-xl border border-border/60 bg-card p-3">
          <p className="text-sm font-medium text-heading">Upload CV & certificates</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {hasStoredCv ? (
              <>
                Hermes already keeps your living CV. Add <strong className="text-heading">certificate</strong>{" "}
                scans (IMCA, BOSIET, medical) — PDF/JPG/PNG. One PDF with many tickets is fine. Only replace
                the main CV if you have a brand-new PDF. {MULTILINGUAL_UPLOAD_HINT}
              </>
            ) : (
              <>
                <strong className="text-heading">Main CV:</strong> one full diving CV PDF.{" "}
                <strong className="text-heading">Certificates:</strong> ticket photos or PDFs (one file can
                hold many certs) — not as the main CV. On phone use the paperclip under chat, or Files → PDF.{" "}
                {MULTILINGUAL_UPLOAD_HINT}
              </>
            )}
          </p>
          <label className="block space-y-1">
            <span className="text-[11px] text-muted-foreground">
              {hasStoredCv ? "Replace living CV from a new PDF (rare)" : "Seed CV (PDF)"}
            </span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => setMainCv(event.target.files?.[0] ?? null)}
              className="w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1.5 file:text-xs file:text-heading"
            />
            {mainCv ? <p className="truncate text-[11px] text-primary">Selected: {mainCv.name}</p> : null}
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-muted-foreground">Certificates (PDF/JPG/PNG)</span>
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg,.pdf,.jpg,.jpeg,.png"
              multiple
              onChange={(event) => {
                const next = Array.from(event.target.files ?? []);
                setCerts((prev) => {
                  const merged = [...prev];
                  for (const file of next) {
                    if (!merged.some((existing) => existing.name === file.name && existing.size === file.size)) {
                      merged.push(file);
                    }
                  }
                  return merged;
                });
              }}
              className="w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1.5 file:text-xs file:text-heading"
            />
          </label>
          <Button
            size="sm"
            className="w-full"
            onClick={() => void processCvUpload()}
            disabled={uploading || (!mainCv && certs.length === 0)}
          >
            {uploading ? "Uploading…" : mainCv ? "Process files" : "Store certificates"}
          </Button>
          {certs.length > 0 ? (
            <ul className="space-y-0.5 text-[11px] text-heading-muted">
              {certs.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2">
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    className="shrink-0 underline"
                    onClick={() => setCerts((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {uploadError ? <p className="text-xs text-amber-800 dark:text-amber-300">{uploadError}</p> : null}
          {uploadNotice ? <p className="text-xs text-success">{uploadNotice}</p> : null}
          {suggestPublish && profileStatus === "draft" ? (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/10 p-2">
              <p className="text-[11px] text-heading">
                Your CV is still a draft — contractors cannot see it until you publish.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href="/preview" target="_blank">
                  <Button size="sm" variant="outline">
                    Preview page
                  </Button>
                </Link>
                <Button
                  size="sm"
                  disabled={visibilityBusy || sending || uploading}
                  onClick={() => void setProfileVisibility("published")}
                >
                  {visibilityBusy ? "Working…" : "Publish page"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2 rounded-xl border border-border/60 bg-card p-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-medium text-heading">
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
                <p className="font-medium text-heading">Living CV</p>
                <p className="text-muted-foreground">
                  Hermes keeps this updated
                  {livingCv.updatedAt ? ` · ${new Date(livingCv.updatedAt).toLocaleString("en-GB")}` : ""}
                </p>
              </li>
            ) : null}
            {documents.map((doc) => (
              <li key={doc.path} className="rounded-lg border border-border/50 px-2.5 py-2 text-xs">
                <p className="font-medium text-heading">{doc.name}</p>
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
      <aside className="hidden w-[300px] shrink-0 border-r border-border/50 bg-muted/80 lg:block xl:w-[320px]">
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
          <aside className="absolute inset-y-0 left-0 w-[min(100%,320px)] border-r border-border/50 bg-muted shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
              <p className="text-sm font-medium text-heading">Workspace</p>
              <button
                type="button"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-heading"
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
      <section className="flex min-w-0 flex-1 flex-col bg-surface-inset">
        <div className="flex items-center justify-between gap-3 border-b border-border/50 px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 text-heading-muted lg:hidden"
              onClick={() => setPanelOpen(true)}
              aria-label="Open workspace panel"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              H
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-heading">Hermes</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {role === "diver"
                  ? firstRun
                    ? "Attach CV and tickets to start"
                    : "Talk to update your CV"
                  : "Recruitment agent"}{" "}
                ·{" "}
                <span className="text-success">Online</span>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {role === "diver" ? (
              profileStatus === "draft" && (livingCv.present || suggestPublish) ? (
                <Button
                  type="button"
                  size="sm"
                  className="hidden sm:inline-flex"
                  disabled={visibilityBusy || sending || uploading}
                  onClick={() => void setProfileVisibility("published")}
                >
                  {visibilityBusy ? "Publishing…" : "Publish"}
                </Button>
              ) : profileStatus === "published" && suggestPhoto ? (
                <Link href="/preview" target="_blank" className="hidden sm:inline">
                  <Button type="button" size="sm">
                    Add photo
                  </Button>
                </Link>
              ) : (
                <span className="hidden rounded-md border border-border/60 px-2 py-1 text-[11px] capitalize text-muted-foreground sm:inline">
                  Profile {profileStatus}
                </span>
              )
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
                <div className="rounded-xl border border-primary/35 bg-primary/10 px-3.5 py-3 text-sm text-heading">
                  <p className="font-medium">You have a new email</p>
                  <p className="mt-1 text-heading/90">
                    From {pendingInbound.from}
                    {pendingInbound.subject ? ` — ${pendingInbound.subject}` : ""}.
                    {pendingInbound.intent === "certificates"
                      ? " They asked for your certificates. Reply yes and I will send them."
                      : " They wrote back — likely interest. Ask Hermes what they said."}
                  </p>
                </div>
              ) : null}
              {role === "diver" && suggestPublish && profileStatus === "draft" ? (
                <div className="rounded-xl border border-primary/40 bg-primary/10 px-3.5 py-3 text-sm text-heading">
                  <p className="font-medium">Ready to go live?</p>
                  <p className="mt-1 text-heading/90">
                    Your CV is saved as a draft. Contractors cannot see it until you publish.
                    Preview first if you want — publishing keeps your username.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href="/preview" target="_blank">
                      <Button size="sm" variant="outline">
                        Preview page
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      disabled={visibilityBusy || sending || uploading}
                      onClick={() => void setProfileVisibility("published")}
                    >
                      {visibilityBusy ? "Publishing…" : "Publish page"}
                    </Button>
                  </div>
                </div>
              ) : null}
              {role === "diver" && suggestPhoto && profileStatus === "published" ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-3 text-sm text-heading">
                  <p className="font-medium">Add a face photo — next step</p>
                  <p className="mt-1 text-heading/90">
                    Your page is live, but without a photo it looks unfinished to contractors.
                    Open Preview and upload a clear head-and-shoulders shot.
                  </p>
                  <div className="mt-3">
                    <Link href="/preview" target="_blank">
                      <Button size="sm">Add photo on Preview</Button>
                    </Link>
                  </div>
                </div>
              ) : null}
              {messages.length <= 1 ? (
                <div className="mb-3 space-y-3">
                  {role === "diver" ? (
                    <div className="rounded-xl border border-border/60 bg-card px-3.5 py-3 text-sm text-muted-foreground">
                      <p className="font-medium text-heading">
                        {firstRun ? "First: get your pack on file" : "Update your CV in this chat"}
                      </p>
                      <p className="mt-1">
                        {firstRun
                          ? "Use the paperclip under the chat, or open Upload in the side panel. Main CV PDF plus ticket photos (IMCA, BOSIET, medical) — don't upload a seaman's book as your only CV."
                          : "Type a change, paste CV text, or attach a ticket scan. Everything is saved in English."}
                      </p>
                      {firstRun ? (
                        <Button size="sm" className="mt-2 lg:hidden" onClick={() => setPanelOpen(true)}>
                          Open upload panel
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {starters.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        disabled={sending || uploading}
                        onClick={() => sendMessage(starter)}
                        className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-left text-xs text-heading-muted/90 transition hover:border-primary/40 hover:bg-muted/40 disabled:opacity-50"
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
                      ? "ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-chat-user px-3.5 py-2.5 text-sm text-heading sm:max-w-[75%]"
                      : "max-w-[92%] rounded-2xl rounded-bl-md border border-border/55 bg-card px-3.5 py-2.5 text-sm text-heading/95 sm:max-w-[80%]"
                  }
                >
                  {item.from === "agent" ? (
                    <p className="mb-1 text-[11px] font-medium text-primary/80">Hermes</p>
                  ) : null}
                  <p className="whitespace-pre-wrap leading-relaxed">{item.text}</p>
                </div>
              ))}

              {sending || uploading ? (
                <div className="max-w-[80%] rounded-2xl rounded-bl-md border border-border/55 bg-card px-3.5 py-2.5 text-sm text-muted-foreground">
                  <p className="mb-1 text-[11px] font-medium text-primary/80">Hermes</p>
                  <p className="animate-pulse-soft">{uploading ? "Processing your CV…" : "Thinking…"}</p>
                </div>
              ) : null}

              {suggestions && suggestions.length > 0 ? (
                <div className="space-y-2 rounded-xl border border-border/60 bg-card/80 p-3">
                  <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                    Job matches
                  </p>
                  {suggestions.map((item) => {
                    const applied = Boolean(item.applied) || appliedJobIds.includes(item.id);
                    return (
                    <div
                      key={item.id}
                      className="rounded-lg border border-border/50 bg-card px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-heading">{item.title}</p>
                          <p className="text-[11px] text-muted-foreground">{item.location}</p>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-success">
                          {applied ? "Applied" : `${item.score}%`}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">{item.reason}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={sending || uploading}
                          onClick={() =>
                            void sendMessage(listedJobMatchPrompt(item), {
                              display: `Match ${item.title}`,
                            })
                          }
                        >
                          Match
                        </Button>
                        <Button
                          size="sm"
                          disabled={sending || uploading || applied}
                          onClick={() =>
                            void sendMessage(applyPromptForJob(item), {
                              display: `Apply to ${item.title}`,
                            })
                          }
                        >
                          {applied ? "Applied" : "Apply"}
                        </Button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              ) : null}

              {cvUpdatedParts.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success/25 bg-success/10 px-3 py-2.5 text-sm text-heading">
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
          className="border-t border-border/50 bg-muted/90 p-3 sm:p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage(input);
          }}
        >
          <div className="flex items-end gap-2 rounded-2xl border border-border/60 bg-card p-2 focus-within:border-primary/40">
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
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-heading-muted/80 transition hover:bg-muted/50 hover:text-heading disabled:opacity-50"
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
              ref={chatInputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage(input);
                }
              }}
              rows={1}
              className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-heading outline-none placeholder:text-muted-foreground"
              placeholder={
                role === "diver"
                  ? firstRun
                    ? "Attach CV + tickets, or type here…"
                    : "Tell Hermes what to change on your CV…"
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
