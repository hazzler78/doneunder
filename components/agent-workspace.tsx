"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
};

type DocumentEntry = {
  name: string;
  path: string;
  created_at: string;
  size: number;
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

const diverStarterPrompts = [
  "How does my profile look?",
  "What should I improve before publishing?",
  "Find jobs that match my certifications.",
  "Make my headline stronger for offshore work.",
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
  const [docLoading, setDocLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [mainCv, setMainCv] = useState<File | null>(null);
  const [certs, setCerts] = useState<File[]>([]);

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

  async function loadChatHistory(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setHistoryLoading(true);
    }
    try {
      const response = await fetch("/api/chat/messages");
      const data = (await response.json()) as { messages?: StoredChatMessage[] };
      if (!response.ok || !data.messages?.length) {
        if (!options?.silent) {
          setMessages([
            {
              id: "welcome",
              from: "agent",
              text:
                role === "diver"
                  ? "Hi — I'm Hermes. Upload your CV on the left, then just talk to me naturally: review your profile, tweak your headline, or find matching jobs."
                  : "Welcome. I can help draft job requests and shortlist matching diver profiles.",
            },
          ]);
        }
        return;
      }

      setMessages(
        data.messages.map((item) => ({
          id: item.id,
          from: item.role === "user" ? "user" : "agent",
          text: item.content,
        })),
      );
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
      const data = (await response.json()) as { documents?: DocumentEntry[] };
      if (response.ok) {
        setDocuments(data.documents ?? []);
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
          { id: crypto.randomUUID(), from: "agent", text: data.reply || "Could not process this request." },
        ]);
        return;
      }

      setMessages((prev) => [...prev, { id: crypto.randomUUID(), from: "agent", text: data.reply }]);
      setSuggestions(data.suggestions ?? []);
      if (data.profileStatus) setProfileStatus(data.profileStatus);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), from: "agent", text: "Network error while contacting the agent." },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function processCvUpload() {
    if (!mainCv) {
      setUploadError("Select a main CV PDF first.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    const form = new FormData();
    form.append("mainCv", mainCv);
    certs.forEach((file) => form.append("certificates", file));

    try {
      const response = await fetch("/api/diver/profile/process-cv", {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as { error?: string; detail?: string; warnings?: string[] };
      if (!response.ok) {
        const detail = data.detail ? ` ${data.detail}` : "";
        setUploadError(`${data.error ?? "Failed to process CV upload."}${detail}`);
        return;
      }
      setMainCv(null);
      setCerts([]);
      await loadDocuments();
      await loadChatHistory({ silent: true });
    } catch {
      setUploadError("Upload request failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Workspace</span>
            <Badge>{role}</Badge>
          </CardTitle>
          <CardDescription>{displayName}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-border/70 p-3 text-xs text-muted-foreground">
            <p>User id: {userId.slice(0, 8)}...</p>
            {username ? <p>Public username: {username}</p> : null}
            {role === "diver" ? (
              <p>
                Profile status: <span className="text-cyan-200">{profileStatus}</span>
              </p>
            ) : null}
          </div>

          {role === "diver" ? (
            <div className="space-y-2 rounded-md border border-border/70 p-3">
              <p className="text-sm font-medium">Upload CV and certificates</p>
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => setMainCv(event.target.files?.[0] ?? null)}
                className="w-full text-xs"
              />
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                multiple
                onChange={(event) => setCerts(Array.from(event.target.files ?? []))}
                className="w-full text-xs"
              />
              <Button size="sm" onClick={processCvUpload} disabled={uploading}>
                {uploading ? "Processing..." : "Process files"}
              </Button>
              {uploadError ? <p className="text-xs text-amber-300">{uploadError}</p> : null}
            </div>
          ) : null}

          <div className="space-y-2 rounded-md border border-border/70 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Files</p>
              <Button size="sm" variant="outline" onClick={loadDocuments} disabled={docLoading || role !== "diver"}>
                {docLoading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
            {role !== "diver" ? (
              <p className="text-xs text-muted-foreground">Company files panel comes next.</p>
            ) : documents.length === 0 ? (
              <p className="text-xs text-muted-foreground">No uploaded files yet.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {documents.map((doc) => (
                  <li key={doc.path} className="rounded border border-border/60 p-2">
                    <p className="font-medium">{doc.name}</p>
                    <p className="text-muted-foreground">{new Date(doc.created_at).toLocaleString("en-GB")}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="min-h-[70vh]">
        <CardHeader>
          <CardTitle>Agent Chat</CardTitle>
          <CardDescription>
            Thread-scoped workspace. Each logged-in user is isolated to their own agent context.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex h-[65vh] flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {starters.map((starter) => (
              <Button key={starter} size="sm" variant="outline" onClick={() => sendMessage(starter)} disabled={sending}>
                {starter}
              </Button>
            ))}
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto rounded-md border border-border/70 bg-[#051322]/50 p-3">
            {historyLoading ? (
              <p className="text-sm text-muted-foreground">Loading conversation...</p>
            ) : (
              <>
                {messages.map((item) => (
                  <div
                    key={item.id}
                    className={item.from === "user" ? "ml-auto max-w-[85%] rounded-md bg-cyan-900/40 p-2 text-sm" : "max-w-[85%] rounded-md border border-border/60 p-2 text-sm"}
                  >
                    <p className="mb-1 text-xs text-muted-foreground">{item.from === "user" ? "You" : "Hermes"}</p>
                    <p>{item.text}</p>
                  </div>
                ))}
                {sending ? (
                  <div className="max-w-[85%] rounded-md border border-border/60 p-2 text-sm text-muted-foreground">
                    <p className="mb-1 text-xs">Hermes</p>
                    <p>Thinking...</p>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {suggestions && suggestions.length > 0 ? (
            <div className="rounded-md border border-border/70 p-3">
              <p className="mb-2 text-sm font-medium">Proactive job suggestions</p>
              <ul className="space-y-2 text-xs">
                {suggestions.map((item) => (
                  <li key={item.id} className="rounded border border-border/60 p-2">
                    <p className="font-medium">
                      {item.title} ({item.location}) - score {item.score}
                    </p>
                    <p className="text-muted-foreground">{item.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(input);
            }}
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="min-h-[56px] flex-1 rounded-md border bg-transparent p-2 text-sm"
              placeholder="Talk to Hermes naturally — review my CV, update my headline, find jobs..."
            />
            <Button type="submit" disabled={sending}>
              {sending ? "Sending..." : "Send"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
