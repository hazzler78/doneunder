"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Mic, MicOff, Square } from "lucide-react";
import { HermesVoiceBadge, type HermesVoicePhase } from "@/components/company/hermes-voice-badge";
import { Button } from "@/components/ui/button";
import type { RevealCard, SearchResult } from "@/lib/company-search";
import { runHermesCompanySearch } from "@/app/company/search/actions";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

export type HermesBriefResult = {
  summary: string;
  result: SearchResult;
  profiles: RevealCard[];
  source: "ai" | "heuristic";
};

type Props = {
  onResult: (outcome: HermesBriefResult) => void;
};

/**
 * Hermes hiring brief: paste or speak (Cursor live-call style badge while
 * listening; candidate search runs in the background as the brief settles).
 *
 * Phase-1 stub uses the Web Speech API — not full Cursor voice-call parity
 * (no bidirectional TTS room). See docs/company-hermes-voice.md.
 */
export function HermesCompanyBrief({ onResult }: Props) {
  const [brief, setBrief] = useState("");
  const [phase, setPhase] = useState<HermesVoicePhase>("idle");
  const [badgeDetail, setBadgeDetail] = useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const listeningRef = useRef(false);
  const briefRef = useRef(brief);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSearchedRef = useRef("");

  useEffect(() => {
    briefRef.current = brief;
  }, [brief]);

  useEffect(() => {
    return () => {
      listeningRef.current = false;
      recognitionRef.current?.abort();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  function queueBackgroundSearch(nextBrief: string, fromVoice: boolean) {
    const trimmed = nextBrief.trim();
    if (trimmed.length < 12) return;
    if (trimmed === lastSearchedRef.current) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      lastSearchedRef.current = trimmed;
      if (fromVoice || listeningRef.current) {
        setPhase("searching");
        setBadgeDetail("Matching candidates…");
      }
      startTransition(async () => {
        const res = await runHermesCompanySearch(trimmed);
        if (!res.ok) {
          setError(res.error);
          if (listeningRef.current) setPhase("listening");
          else setPhase("idle");
          return;
        }
        setError(null);
        onResult({
          summary: res.summary,
          result: res.result,
          profiles: res.profiles,
          source: res.source,
        });
        setBadgeDetail(`${res.result.matchCount} matches`);
        if (listeningRef.current) setPhase("listening");
        else setPhase("idle");
      });
    }, fromVoice ? 900 : 0);
  }

  function stopListening() {
    listeningRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if (phase === "listening") setPhase(pending ? "searching" : "idle");
  }

  function startListening() {
    setError(null);
    const w = window as SpeechWindow;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      setVoiceSupported(false);
      setPhase("error");
      setBadgeDetail("Use paste for now");
      setError(
        "This browser has no Web Speech API. Paste the hiring brief instead — full Cursor-style voice call parity is a later phase.",
      );
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;
    listeningRef.current = true;
    setPhase("listening");
    setBadgeDetail("Speak your brief");

    let committed = briefRef.current.trim();

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) {
          committed = `${committed} ${piece}`.trim();
        } else {
          interim += piece;
        }
      }
      const next = `${committed}${interim ? ` ${interim}` : ""}`.trim();
      setBrief(next);
      setBadgeDetail(interim ? interim.slice(0, 48) : "Listening");
      // Background tool search while the call/listening badge stays active.
      queueBackgroundSearch(committed || next, true);
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      setError(event.error || "Voice input failed");
      setPhase("error");
      setBadgeDetail(event.error || "Try paste");
      listeningRef.current = false;
    };

    recognition.onend = () => {
      if (!listeningRef.current) {
        if (!pending) setPhase("idle");
        return;
      }
      // Keep the "call" alive — restart like a continuous live session.
      try {
        recognition.start();
      } catch {
        listeningRef.current = false;
        setPhase(pending ? "searching" : "idle");
      }
    };

    try {
      recognition.start();
    } catch {
      setVoiceSupported(false);
      setPhase("error");
      setError("Could not start microphone listening.");
    }
  }

  function onSubmitPaste() {
    setError(null);
    stopListening();
    setPhase("searching");
    setBadgeDetail("Matching candidates…");
    queueBackgroundSearch(brief, false);
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border/60 bg-card/90 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Hermes</p>
          <h2 className="mt-1 font-display text-xl font-semibold text-heading">
            Describe who you need
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Speak or paste a hiring brief. Hermes searches in the background while you talk — results
            stay locked (initials + industry) until you unlock this search.
          </p>
        </div>
        <HermesVoiceBadge phase={pending && phase === "idle" ? "searching" : phase} detail={badgeDetail} />
      </div>

      <textarea
        value={brief}
        onChange={(event) => setBrief(event.target.value)}
        rows={4}
        placeholder="Ex: Two IMCA sat divers with NDT for North Sea wind, available in 7 days, 1500+ sat hours"
        className="w-full rounded-xl border border-border/70 bg-surface-inset px-3 py-2.5 text-sm text-heading outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
      />

      <div className="flex flex-wrap items-center gap-2">
        {phase === "listening" ? (
          <Button type="button" variant="outline" onClick={stopListening}>
            <Square className="mr-2 h-4 w-4" />
            Stop listening
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={startListening} disabled={!voiceSupported && phase === "error"}>
            {voiceSupported ? <Mic className="mr-2 h-4 w-4" /> : <MicOff className="mr-2 h-4 w-4" />}
            Start voice
          </Button>
        )}
        <Button type="button" onClick={onSubmitPaste} disabled={pending || brief.trim().length < 8}>
          {pending ? "Hermes searching…" : "Ask Hermes to search"}
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <p className="text-[11px] text-muted-foreground">
        Voice badge mirrors Cursor live-call status. Phase 1 uses browser speech recognition; a native
        duplex voice room would be a later upgrade.
      </p>
    </section>
  );
}
