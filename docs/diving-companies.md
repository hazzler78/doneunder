# Diving company directory (Hermes)

Living list for divers (especially school graduates). **Source of truth in production:** Supabase table `diving_companies` (seeded by migration `015_diving_companies.sql`).

Hermes tools:

| Tool | Who | Purpose |
| --- | --- | --- |
| `list_diving_companies` | All divers | Browse / filter by country, scope, hire_graduates, search |
| `apply_to_company` | All divers | Send CV + cert pack **only** when `apply_email` is set |
| `add_diving_company` / `update_diving_company` | Ops (same allow-list as school outreach, default `@gareth`) | Maintain rows and verified inboxes |
| `import_diving_companies_from_url` | Ops (`@gareth`) | Fetch a directory page (e.g. ADC Find A Member), preview, then bulk-add after confirm |

## Import from a link (Gareth)

Example: [ADC Find A Member](https://www.adc-uk.info/find-a-member/) (homepage link also works).

1. In Hermes: paste the URL and ask to import contractors.
2. Hermes previews with `confirmed=false` (ADC defaults to **Full Members** only).
3. Gareth says yes → `confirmed=true` writes name, website, UK/Ireland, notes. **`apply_email` stays empty.**
4. Later, set verified careers inboxes with `update_diving_company`.

Do **not** use imports for CV blasts. ADC forbids membership transcription for direct mailing / e-broadcasts; DoneUnder stores them for diver discovery + confirmed one-company apply only.

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
