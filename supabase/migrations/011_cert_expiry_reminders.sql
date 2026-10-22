-- Certificate expiry reminders. Adds columns and one dedupe index.
-- Does not update existing rows and does not drop columns.

alter table public.diver_profiles
  add column if not exists cert_reminders_enabled boolean not null default true,
  add column if not exists cert_reminder_lead_days integer not null default 30;

alter table public.diver_profiles
  drop constraint if exists diver_profiles_cert_reminder_lead_days_check;

alter table public.diver_profiles
  add constraint diver_profiles_cert_reminder_lead_days_check
  check (cert_reminder_lead_days between 1 and 365);

alter table public.diver_certifications
  add column if not exists expiry_confirmed boolean not null default true;

comment on column public.diver_profiles.cert_reminders_enabled is
  'When false, the daily job sends no certificate expiry emails for this diver.';
comment on column public.diver_profiles.cert_reminder_lead_days is
  'Days before expiry for the first reminder. 7 days and the expiry day stay fixed.';
comment on column public.diver_certifications.expiry_confirmed is
  'False when a file read filled expiry_date and the diver has not confirmed it.';

-- One send per diver, certificate name, expiry date, and step.
create unique index if not exists agent_messages_cert_expiry_reminder_once
  on public.agent_messages (
    (metadata->>'diver_id'),
    (metadata->>'cert_name_key'),
    (metadata->>'expiry_date'),
    (metadata->>'step')
  )
  where (metadata->>'source') = 'cert_expiry_reminder';
