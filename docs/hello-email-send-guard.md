# hello@ same-day send guard

**Why:** On 2026-10-30, Jonny at ROV & Dykker (`post@rovogdykk.no`) got two emails from `hello@doneunder.ai` about an hour apart (Gareth pitch, then Mikael free-referral reply). The shared mailbox must not look like a spam cannon.

**Rule:** At most **one** successful outbound whose **From** address is `hello@doneunder.ai` per **normalized recipient** per **Europe/Berlin calendar day**, unless Mikael has given written go-ahead for a second send that day.

## What is gated

Any Resend send that uses hello@ as the From address, including:

| Path | Feature tag |
|------|-------------|
| `sendPlatformEmail` (cert reminders, etc.) | `send_platform_email` |
| `sendEmailAsLoggedInUser` when From is hello@ (relay: `"Name via doneunder.ai <hello@…>"`) | `send_email_as_logged_in_user` |
| Job alerts | `job_alert` |
| Publish / CV nudges | `publish_nudge` |
| Stuck-diver ops alerts | `stuck_divers_alert` |

Mail that truly sends as `gareth@doneunder.ai` (or another personal `@doneunder.ai` From) is **not** gated.

## How Mikael approves a second send

Pick one:

### A) Env allowlist (quick)

Set Vercel / `.env.local`:

```bash
HELLO_EMAIL_SECOND_SEND_ALLOW=post@rovogdykk.no
# or pin the Berlin day:
HELLO_EMAIL_SECOND_SEND_ALLOW=post@rovogdykk.no:2026-10-30
```

Comma- or whitespace-separated. Bare emails mean **today (Europe/Berlin)**. Then retry the send.

### B) Database approval (no redeploy)

In Supabase SQL (service role / SQL editor):

```sql
insert into public.hello_outbound_approvals (recipient_email, day_berlin, note, approved_by)
values (
  'post@rovogdykk.no',
  (timezone('Europe/Berlin', now()))::date,
  'OK second hello@ send after Gareth pitch',
  'mikael'
)
on conflict (recipient_email, day_berlin) do update
set note = excluded.note, approved_by = excluded.approved_by;
```

Then retry the send. Approval is **day-scoped** for that recipient (Europe/Berlin): further hello@ sends that day are allowed while the row (or env entry) remains. Delete the row / clear the env when done.

### Emergency kill switch

```bash
HELLO_EMAIL_GUARD=off
```

Disables checks and recording. Use only briefly.

## Logging

- Successful hello@ sends → `hello_outbound_sends`
- Blocked attempts → `hello_outbound_blocks` + `console.error("[hello-email-guard] blocked", …)`
- Error codes returned to callers: `hello_same_day_send_blocked`, `hello_send_guard_unavailable`

## Migration

`supabase/migrations/026_hello_outbound_guard.sql` — apply before relying on the guard in production.
