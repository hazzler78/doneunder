-- Lifetime (no-expiry) certificates.
-- Adds one nullable column. Does not update existing rows and does not drop columns.
--   null  = decide from the ticket name (lib/cert-lifetime.ts: HSE, IMCA, ADAS, IDSA, bell,
--           scuba, ALST, supervisor, Norwegian, Danish, Dutch, Swedish, French CAH, welding,
--           chamber operator, licences never expire; medicals, BOSIET/FOET, DMT, etc. do)
--   true  = the diver confirmed this ticket has no expiry date
--   false = the diver confirmed this ticket expires and needs a date

alter table public.diver_certifications
  add column if not exists no_expiry boolean;

comment on column public.diver_certifications.no_expiry is
  'True when the ticket never expires (lifetime). False when it expires. Null means decide from the ticket name.';
