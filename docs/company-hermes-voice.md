# Hermes company search — voice UX

## Required experience (parity target)
Match **Cursor live voice call** UX cues on `/company/search`:

1. **Badge indicator** while voice is active (`Listening`) and while Hermes tools run (`Hermes searching`).
2. **Background tool search** — criteria interpretation + candidate match preview continue while the listening badge stays up (debounced), same spirit as tools running during a Cursor voice call.
3. Results remain **partial** (initials + industry), with **match count pre-pay**, then **one-time unlock for this search** or **monthly**.

## Phase 1 (shipped in this PR)
- Browser **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition`), continuous + interim transcripts.
- `HermesVoiceBadge` for listening / searching / error.
- Debounced `runHermesCompanySearch` while speaking (background search).
- Paste path always available.

## Not yet (open / phased)
- Native duplex **voice room** (Cursor-call grade audio transport, barge-in, server STT, TTS replies).
- Shared call object across tabs / mobile Safari reliability.
- Language auto-detect (phase 1 defaults `sv-SE` for Nordic desks; EN briefs still parse via heuristics/AI).

## Open questions
- Do we invest in a real-time voice stack (LiveKit / OpenAI Realtime / similar) or keep Web Speech + badge as the long-term lightweight path?
- Should Hermes **speak** match-count summaries back (TTS), or stay badge + text only?
- Default recognition language: always `sv-SE`, user toggle, or browser locale?
