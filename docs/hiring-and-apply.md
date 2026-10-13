# How commercial diving hiring actually works

Last reviewed: 2026-10-13.

This is product policy, not a backlog. Read it before adding apply features, an ATS, a company portal, or a CV blast. The living CV and certificate pack already match how contractors hire. Extra machinery does not — until real contractor desks prove otherwise.

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
| Fake desk | Apply looks like it went to a company but landed at DoneUnder. Trust dies immediately. |

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
3. **Honest listings.** Only show campaigns with a **verified `applyEmail`**. `closesAt` hides the campaign. No ghost ads. No diver fees. Never pretend DoneUnder is the contractor desk.

Do **not** treat “fill the contractor’s Workday form” as the gap. We do not know which companies even have a form, and the ones that hire divers often do not.

## DoneUnder apply policy

### Phase 1 — now

After `match_job` and a **clear yes**, `apply_job` sends the living CV PDF + certificate pack **to the campaign’s verified contractor inbox**.

- **Required:** `PublicJob.applyEmail` from the company’s own careers / imprint page (or a live public ad that names that inbox). Never invent one. Never fall back to `hello@doneunder.ai`.
- Campaigns **without** `applyEmail` are **hidden** from `/jobs`, Hermes `open_campaigns`, match, and apply.
- Confirm first (`confirmed=true`). No send on a maybe.
- Do not re-send if `hermes_apply_job` already logged that `jobId`.
- Closed campaigns (`closesAt` / status) cannot be applied to.
- Required tickets that are **expired or missing** block `apply_job`. Same-day expiry still counts as current. A ticket with no date is current-but-unknown — Hermes should ask for the date, not invent one.
- Do **not** write catalog job ids into an `applications` UUID table. Catalog ids are slugs (`job-baltic-taucher-2026-11`), not Postgres UUIDs.

`hello@` remains a **company contact** address for listing requests — not an apply desk.

### Phase 1b — curated company browse + apply

Hermes can also browse a curated `diving_companies` directory (see `docs/diving-companies.md`).

- `list_diving_companies` for all divers (graduates: prefer `hire_graduates=true`).
- Soft fit % from typical tickets — **warn**, do not hard-block.
- `apply_to_company` only when `apply_email` is verified on the row. Never invent an inbox. Confirm first. Dedupe via `hermes_apply_company`.
- Ops (`@gareth`) may `import_diving_companies_from_url` from public directories (e.g. ADC Find A Member): preview → confirm → bulk add **name/website only**. Still no inventing emails and no CV blast.

### Phase 2 — only after evidence

A company-facing intake (named `applyEmail`, or a company desk that can mark received / shortlist) **if** Phase 1 shows companies asking for that.

### Phase 3 — only after evidence

Hermes reaching out proactively, or applying without the diver in the loop. Not before we know that divers and companies want it.

## Do not build until a diver / company asks

- ATS / form-fill / browser automation against contractor portals
- CV blast to a list of inboxes
- Company apply portal or full ATS
- Coupling catalog jobs to `applications.id` UUIDs
- Charging divers to apply or to be listed
- Leaving campaigns on `/jobs` after `closesAt` or without `applyEmail`
- Apply without match / with dead required tickets
- Falling back to `hello@` as a fake listing desk

## Code map

| Piece | Where |
| --- | --- |
| Live campaigns + required `applyEmail` | `lib/job-catalog.ts` |
| Open filter, match prompt, draft, desk address | `lib/jobs.ts` (`hasApplyInbox`, `isJobOpen`, `applyAddressForJob`) |
| `match_job` / `apply_job` | `lib/hermes-diver-agent.ts` |
| Curated company directory + soft score | `lib/diving-companies.ts` |
| `list_diving_companies` / `apply_to_company` | `lib/hermes-diver-agent.ts` |
| Hide when closed or no inbox | `lib/jobs.ts` `isJobOpen` + `/jobs` |
| SQL for `closes_at` (run in prod when possible) | `supabase/migrations/010_jobs_closes_at.sql` |
| Company directory seed | `supabase/migrations/015_diving_companies.sql` |

Until that migration runs, the catalog is the live board.

## Open questions (answer from real company replies, not from code)

- Do contractors reply to Hermes inbound, or do they call the diver?
- Is a short covering note useful, or do they only open the PDFs?
- Which tickets are actually the first filter for North Sea vs inshore vs wind?

When those have answers, update this file and then change the product — not the other way around.
