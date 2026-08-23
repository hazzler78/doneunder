-- Public job board: listings drop off when closes_at has passed.

alter table public.jobs
  add column if not exists closes_at timestamptz,
  add column if not exists scope text not null default 'offshore',
  add column if not exists mobilization text;

update public.jobs
set status = 'filled'
where status = 'open' and closes_at is null;

insert into public.users (id, role, email, username, full_name)
values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'company',
  'listings@doneunder.ai',
  'doneunder-listings',
  'doneunder.ai'
)
on conflict (id) do nothing;

insert into public.companies (user_id, company_name, subscription_status, plan)
values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'doneunder.ai',
  'active',
  '249'
)
on conflict (user_id) do nothing;

insert into public.jobs (
  id, company_id, title, description, location, start_date, required_certs, status, closes_at, scope, mobilization
) values
(
  'a1a1a1a1-a1a1-41a1-a1a1-a1a1a1a1a1a1',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Air divers — North Sea IRM',
  'Inspection, repair and maintenance on producing North Sea assets. Surface-supplied air diving with possible sat-support. IMCA DSV / air spread. Mobilise from Aberdeen or Esbjerg.',
  'Northern North Sea',
  '2026-09-28',
  array['IMCA','BOSIET','OEUK Medical'],
  'open',
  '2026-09-14T17:00:00Z',
  'offshore',
  '72 hours'
),
(
  'a2a2a2a2-a2a2-42a2-a2a2-a2a2a2a2a2a2',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Inspection divers — offshore wind',
  'Monopile and transition-piece inspection package in the German Bight. NDT welcome. Air diving from a walk-to-work / CTV spread. English reporting.',
  'German Bight',
  '2026-10-06',
  array['IMCA','BOSIET','PCN NDT'],
  'open',
  '2026-09-28T17:00:00Z',
  'offshore',
  '5 days'
),
(
  'a3a3a3a3-a3a3-43a3-a3a3-a3a3a3a3a3a3',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Inshore construction divers — Baltic harbour works',
  'Lock, quay and intake work in the Baltic. Air diving, Broco cutting, and construction support. EU work eligibility required.',
  'South Baltic',
  '2026-10-12',
  array['IMCA','HSE Diver Medical'],
  'open',
  '2026-10-05T17:00:00Z',
  'inshore',
  '7 days'
),
(
  'a4a4a4a4-a4a4-44a4-a4a4-a4a4a4a4a4a4',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Saturation support — Norwegian Continental Shelf',
  'Sat-system support and air diving on NCS IRM / installation follow-on. DMT preferred. Valid OGUK/OEUK medical.',
  'Norwegian Sea / North Sea',
  '2026-09-22',
  array['IMCA','BOSIET','OEUK Medical'],
  'open',
  '2026-09-08T17:00:00Z',
  'offshore',
  '48 hours'
),
(
  'a5a5a5a5-a5a5-45a5-a5a5-a5a5a5a5a5a5',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Diver Medic Technician — short-notice DSV',
  'DMT on a North Sea DSV for mixed IRM and construction. Must hold a current DMT ticket and be ready to sail on short notice.',
  'North Sea',
  '2026-10-01',
  array['IMCA','DMT','BOSIET'],
  'open',
  '2026-10-18T17:00:00Z',
  'offshore',
  '24–48 hours'
)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  location = excluded.location,
  start_date = excluded.start_date,
  required_certs = excluded.required_certs,
  status = excluded.status,
  closes_at = excluded.closes_at,
  scope = excluded.scope,
  mobilization = excluded.mobilization;
