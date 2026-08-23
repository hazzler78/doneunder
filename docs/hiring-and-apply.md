# How commercial diving hiring actually works

Last reviewed: 2026-08-23.

This is product policy, not a backlog. Read it before adding apply features, an ATS, a company portal, or a CV blast. The living CV and certificate pack already match how contractors hire. Extra machinery does not — until `hello@doneunder.ai` proves otherwise.

Research is from public job ads, competitor sites, and diver complaints (forums / job boards). We have **not** yet interviewed contractor crewing desks. Treat company-side claims as working assumptions until real applications land.

## How a contractor actually hires

The payload is still email:

1. Diver (or their agent) sends **CV + current tickets** to a named inbox (`jobs@`, `hr@`, `careers@`, a superintendent).
2. Crewing checks that tickets are **current** (IMCA / HSE diver, BOSIET or FOET, OEUK/OGUK or HSE medical, DMT when the role needs it). Expired medical or BOSIET is an instant no.
3. If the pack looks right, someone calls. If it does not, silence.

That pattern is still on live ads in 2026 (“email your CV and certifications to…”). Agency portals exist (Airswift, Brunel, NES-style ATS). They sit **beside** the contractor email pack; they are not the North Sea / inshore default.

Freelance / contract diving is network-heavy. Many seats never hit a public board. When they do, the apply step is still an email with attachments — not a 12-field web form.

## What divers actually complain about

Not “the form was annoying.” The recurring pain:

| Complaint | What it means for us |
| --- | --- |
| Ghosting | Apply into a black hole. No receipt, no reject, no call. |
| Ghost ads | Listing stays up after the seat is filled or the window closed. |
| Dead tickets | Apply with expired medical / BOSIET and get dumped. Re-sending the same pack every campaign. |
| Fees | Sites or “agencies” that charge divers to be visible. Trust dies immediately. |
| Stale CV | Every apply is a zip of mixed scans. Nobody knows which ticket is current. |

Rigzone-style oil-and-gas boards are the reference for the ghosting pattern: resume email in, nothing back.

## Landscape (do not copy blindly)

| Player | What they are | Takeaway |
| --- | --- | --- |
| **cDiver.net** | Commercial diving jobs + community + resume bank. Closest specialised board. | Divers already have a place to post. Our edge is a **verified, current** ticket pack — not another resume dump. |
| **Rigzone** | Oil & gas job board. Apply with resume. | Reach without receipt. Do not become this. |
| **Airswift / Brunel** | Staffing ATS for energy / engineering. Some dive-adjacent roles. | Portal apply is an agency product. Contractors still want the email pack. Do not build their ATS. |
| **School / Facebook / Skool ads** | “Send CV + certs to hr@…” | Confirms the contractor path. |

## The real product gap

Build for this:

1. **Receipt.** Someone got the pack. Hermes can say so. A reply can come back to Hermes (inbound Reply-To), not vanish.
2. **Current tickets.** Do not apply if medical / BOSIET / required cert is missing or expired. Match first, then apply.
3. **Honest listings.** `closesAt` hides the campaign. No ghost ads. No diver fees.

Do **not** treat “fill the contractor’s Workday form” as the gap. We do not know which companies even have a form, and the ones that hire divers often do not.

## DoneUnder apply policy

### Phase 1 — now (PR #29)

After `match_job` and a **clear yes**, `apply_job` sends the living CV PDF + certificate pack.

- Default desk: `hello@doneunder.ai` (`CONTACT_EMAIL`).
- Override later with `PublicJob.applyEmail` when a company has given an inbox. Never invent one.
- Confirm first (`confirmed=true`). No send on a maybe.
- Do not re-send if `hermes_apply_job` already logged that `jobId`.
- Closed campaigns (`closesAt` / status) cannot be applied to.
- Do **not** write catalog job ids into an `applications` UUID table. Catalog ids are slugs (`job-nsea-irm-2026-09`), not Postgres UUIDs.

`hello@` is how we learn. When Gareth or other divers press Apply, the inbox shows: did they send, what did the company ask next, do they want a named address.

### Phase 2 — only after evidence

A company-facing intake (named `applyEmail`, or a company desk that can mark received / shortlist) **if** Phase 1 shows companies asking for that.

### Phase 3 — only after evidence

Hermes reaching out proactively, or applying without the diver in the loop. Not before we know that divers and companies want it.

## Do not build until `hello@` (or a diver / company) asks

- ATS / form-fill / browser automation against contractor portals
- CV blast to a list of inboxes
- Company apply portal or full ATS
- Coupling catalog jobs to `applications.id` UUIDs
- Charging divers to apply or to be listed
- Leaving campaigns on `/jobs` after `closesAt`
- Apply without match / with dead required tickets

## Code map

| Piece | Where |
| --- | --- |
| Live campaigns + optional `applyEmail` | `lib/job-catalog.ts` |
| Open filter, match prompt, draft, desk address | `lib/jobs.ts` |
| `match_job` / `apply_job` | `lib/hermes-diver-agent.ts` |
| Hide when closed | `lib/jobs.ts` `isJobOpen` + `/jobs` |
| SQL for `closes_at` (run in prod when possible) | `supabase/migrations/010_jobs_closes_at.sql` |

Until that migration runs, the catalog is the live board.

## Open questions (answer from inbox, not from code)

- Do contractors want the pack at a named mailbox, or are they fine with DoneUnder as desk?
- Do they reply to Hermes inbound, or do they call the diver?
- Is a short covering note useful, or do they only open the PDFs?
- Which tickets are actually the first filter for North Sea vs inshore vs wind?

When those have answers, update this file and then change the product — not the other way around.
