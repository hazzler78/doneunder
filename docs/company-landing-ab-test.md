# Company registration landing — A/B test plan

## Goal
Measure whether first-impression headline copy on `/company` (and `/company/register`) changes company signup start rate, without sounding like a job-ad board.

## Variants (Swedish)
| Variant | Headline | Support |
| --- | --- | --- |
| **A (default)** | vi har redan börjat leta | registrera dig och se dina träffar |
| **B** | träffarna finns redan här | registrera dig och se vilka som matchar |

Rules for both: no exclamation marks; calm; company has the upper hand; not “post a job / browse CVs” energy.

## Primary metric
**Company register start rate** = unique visitors on `/company` who submit `/company/register` (or click through to the register form and complete account creation) within the same session.

Secondary:
- Click-through from landing CTA → register form (`company_landing_cta`)
- Search page reached after signup (`company_search_view`)
- Unlock checkout start (`stripe_checkout_start` with company access metadata)

## Sample size / notes
- Early traffic is small (commercial diving ICP). Treat this as a **directional** test, not a high-power experiment.
- Aim for ~**100 landing sessions per variant** before calling a winner, or **2 weeks**, whichever comes first — then review; do not auto-ship B.
- Exclude internal/team traffic when possible (admin accounts, known ops emails).
- If daily company visits stay under ~10, keep A as default and only rotate B via `?v=b` for paid/campaign links.

## Light implementation (shipped)
1. Copy lives in `lib/company-landing-copy.ts`.
2. Landing accepts `?v=a` / `?v=b` (default **a**).
3. Variant is stamped on CTA links as `v=` and tracked via Vercel Analytics:
   - `company_landing_view` `{ variant }`
   - `company_landing_cta` `{ variant }`
4. No feature-flag service required. Campaigns can deep-link `https://doneunder.ai/company?v=b`.

## Decision rule
- Ship the winner as the new default in `COMPANY_LANDING_DEFAULT_VARIANT` only after Mikael reviews absolute counts (not just relative %).
- If inconclusive, keep **A** (“vi har redan börjat leta”).

## Open questions
- Is Swedish-only correct for all company traffic, or do we need an EN twin test for non-Nordic desks?
- Should the support line stay Swedish after register (form labels are currently English to match site chrome)?
- Voice on company search: see [company-hermes-voice.md](./company-hermes-voice.md) (badge + background search shipped; native call parity phased).
