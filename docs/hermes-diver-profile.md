# Hermes ↔ DoneUnder diver profile integration

This document describes how an external Hermes agent (e.g. Telegram bot) should read and update diver profiles in DoneUnder.ai.

## Recommended architecture

```
Telegram user
    → Hermes agent (orchestrator)
        → DoneUnder Agent API (this app)
            → lib/diver-profile-service (canonical profile logic)
                → Supabase Postgres
```

**Do not** let the Telegram bot write directly to Postgres. Always go through the Agent API so validation, audit logging, and publish rules stay consistent.

## Authentication

Set in Vercel / `.env.local`:

```bash
HERMES_AGENT_SECRET=long-random-secret
```

Every agent request must include:

```http
Authorization: Bearer <HERMES_AGENT_SECRET>
```

Optional traceability headers:

| Header | Purpose |
|--------|---------|
| `X-Hermes-Source-Ref` | Message/thread id stored in `source_ref` fields (defaults patches to `source: ai`) |
| `X-Hermes-Channel` | `telegram` or `web` |
| `X-Hermes-External-Chat-Id` | Telegram `chat_id` (or web session id) for thread touch/update |

If `HERMES_AGENT_SECRET` is missing, agent routes return `503`.

## Thread mapping (Telegram)

Before chatting about a profile, link a Telegram chat to a diver:

```http
POST /api/agent/threads
Authorization: Bearer <secret>
Content-Type: application/json

{
  "diver_id": "uuid-of-diver",
  "channel": "telegram",
  "external_chat_id": "123456789",
  "metadata": { "telegram_username": "gareth_diver" }
}
```

Resolve diver from chat later:

```http
GET /api/agent/threads?channel=telegram&external_chat_id=123456789
Authorization: Bearer <secret>
```

## Profile operations

### Read full profile

```http
GET /api/agent/diver/{diverId}/profile
Authorization: Bearer <secret>
```

Response includes `profile`, `experiences`, `certifications`, `references`, and `validation` (errors/warnings).

### Iterative partial update (chat edits)

```http
PATCH /api/agent/diver/{diverId}/profile
Authorization: Bearer <secret>
X-Hermes-Source-Ref: telegram-msg-42
Content-Type: application/json

{
  "headline": "Offshore Commercial Diver | 20+ Years",
  "ambassador_short_bio": "Senior diver with global campaign experience."
}
```

Only include fields that change. Arrays (`experiences`, `certifications`, `references`) replace the full list when provided.

PATCH merges into the current profile, re-syncs `polished_cv_json`, and returns updated data + `validation`.

### Publish ambassador page

```http
POST /api/agent/diver/{diverId}/profile/publish
Authorization: Bearer <secret>
```

Publishing requires at least a non-empty `headline`. Returns `422` with `validation.errors` if not ready.

On success, `profile_status` becomes `published` and `/{username}` is publicly visible.

## Suggested Hermes conversation flow

1. **Link session** — `POST /api/agent/threads` when diver identifies themselves (email/username/login code).
2. **Load memory** — `GET /api/agent/threads/messages?channel=telegram&external_chat_id=...` for prior conversation turns.
3. **Load context** — `GET /api/agent/diver/{id}/profile` at start of each session.
4. **Apply edits** — `PATCH` after each confirmed change in chat.
5. **Persist turns** — `POST /api/agent/threads/messages` after each user/assistant exchange.
6. **Review** — share validation warnings with the diver.
7. **Publish** — `POST .../publish` when diver confirms.

## Conversation memory

Each workspace user (diver or company) has one `agent_threads` row per channel (`web` or `telegram`). Messages are stored in `agent_messages` and loaded on every turn.

### Read messages (Hermes)

```http
GET /api/agent/threads/messages?channel=telegram&external_chat_id=123456789&limit=40
Authorization: Bearer <secret>
```

### Append message (Hermes)

```http
POST /api/agent/threads/messages
Authorization: Bearer <secret>
Content-Type: application/json

{
  "channel": "telegram",
  "external_chat_id": "123456789",
  "role": "user",
  "content": "How does my profile look?"
}
```

Roles: `user`, `assistant`, `system`.

### Web workspace

Logged-in users load history via `GET /api/chat/messages`. New turns are persisted automatically by `POST /api/chat`.

Draft profiles can be previewed by the owner before publish:

| URL | Purpose |
|-----|---------|
| `/preview` | Ambassador page preview (draft, owner-only) |
| `/preview/cv` | Full CV preview (draft, owner-only) |
| `/{username}` | Public ambassador page (published only) |

## Source of truth

| Data | Canonical location |
|------|-------------------|
| Structured profile fields | `diver_profiles` + child tables |
| AI snapshot | `polished_cv_json` (synced on save/patch) |
| Print/PDF CV text | `polished_cv_markdown` |
| Public marketing copy | `ambassador_*` fields |
| Live/public visibility | `profile_status = 'published'` |

## Audit trail

Agent calls are logged in `ai_interactions` with features:

- `hermes_profile_get`
- `hermes_profile_patch`
- `hermes_profile_publish`
- `hermes_thread_upsert`
- `hermes_message_append`

## Diver self-service (non-agent)

Logged-in divers use cookie auth:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/diver/profile` | GET | Load own profile |
| `/api/diver/profile` | PUT | Full save |
| `/api/diver/profile/publish` | POST | Publish own profile |
| `/api/diver/profile/process-cv` | POST | Upload CV + AI extract |

## Security notes

- Keep `HERMES_AGENT_SECRET` server-side only (Hermes backend / Vercel env).
- Agent routes use Supabase **service role** after bearer verification.
- Rotate the secret if leaked.
- Prefer mapping Telegram chats via `agent_threads` instead of accepting raw `diver_id` from users without verification.

## Local setup checklist

1. Run migrations through `006_agent_threads.sql`.
2. Set `HERMES_AGENT_SECRET` in `.env.local`.
3. Bootstrap a diver (`npm run bootstrap:gareth-auth`).
4. Link thread and test:

```bash
curl -X POST http://localhost:3000/api/agent/threads \
  -H "Authorization: Bearer $HERMES_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"diver_id":"<uuid>","channel":"telegram","external_chat_id":"999001"}'
```
