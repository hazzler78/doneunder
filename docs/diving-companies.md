# Diving company directory (Hermes)

Living list for divers (especially school graduates). **Source of truth in production:** Supabase table `diving_companies` (seeded by migration `015_diving_companies.sql`).

Hermes tools:

| Tool | Who | Purpose |
| --- | --- | --- |
| `list_diving_companies` | All divers | Browse / filter by country, scope, hire_graduates, search |
| `apply_to_company` | All divers | Send CV + cert pack **only** when `apply_email` is set |
| `add_diving_company` / `update_diving_company` | Ops (same allow-list as school outreach, default `@gareth`) | Maintain rows and verified inboxes |

## Rules

- **Never invent** a careers email. Leave `apply_email` null until a real desk is known.
- Soft fit % from `typical_certs` + location. Missing tickets **warn** but do not block company apply (grads often lack a full offshore pack).
- Campaign `apply_job` stays strict. Company apply is the open-minded path.
- No web crawl, no CV blast, no auto-send without diver `confirmed=true`.

## Adding a verified inbox

1. Confirm the address with the contractor (or school careers desk).
2. In Hermes (ops user): `update_diving_company` with `apply_email`.
3. Divers can then apply; Hermes logs `hermes_apply_company` and will not re-send to the same company.

## Seed focus

First wave: UK / Netherlands / Belgium / Norway / Baltic-adjacent construction and air-dive paths (`hire_graduates=true` where junior entry is realistic). Large EPCI names are listed for browse with lower graduate expectation.
