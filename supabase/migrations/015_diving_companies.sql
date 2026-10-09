-- Curated diving-company directory for Hermes browse + apply (verified inboxes only).

create table if not exists public.diving_companies (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  name text not null,
  country text,
  location text,
  website text,
  scopes text[] not null default '{}',
  typical_certs text[] not null default '{}',
  notes text,
  hire_graduates boolean not null default false,
  apply_email text,
  status text not null default 'active'
    check (status in ('active', 'skip')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists diving_companies_status_idx
  on public.diving_companies (status, hire_graduates, name);

create index if not exists diving_companies_country_idx
  on public.diving_companies (country);

alter table public.diving_companies enable row level security;

comment on table public.diving_companies is
  'Curated commercial diving contractors / crewing desks. Hermes lists for all divers; apply only when apply_email is set. Maintained via ops tools (service role).';

insert into public.diving_companies (
  slug, name, country, location, website, scopes, typical_certs, notes, hire_graduates, apply_email, status
) values
  (
    'shearwater',
    'Shearwater Marine Services',
    'UK',
    'Scotland',
    'https://www.shearwatermarine.com',
    array['inshore', 'offshore'],
    array['IMCA', 'HSE Diver Medical', 'BOSIET'],
    'ADC network / PDA sister company. Construction and air diving — strong graduate path.',
    true,
    null,
    'active'
  ),
  (
    'james-fisher-diving',
    'James Fisher Diving',
    'UK',
    'United Kingdom',
    'https://www.james-fisher.com',
    array['offshore', 'inshore'],
    array['IMCA', 'BOSIET', 'OEUK Medical'],
    'UK marine services; air and inspection work across energy and infrastructure.',
    true,
    null,
    'active'
  ),
  (
    'bibby-marine',
    'Bibby Marine',
    'UK',
    'Liverpool / North Sea',
    'https://www.bibbymarine.com',
    array['offshore'],
    array['IMCA', 'BOSIET', 'OEUK Medical'],
    'SOV / walk-to-work and offshore support — wind and IRM adjacent.',
    false,
    null,
    'active'
  ),
  (
    'n-sea',
    'N-Sea',
    'Netherlands',
    'Netherlands / North Sea',
    'https://n-sea.com',
    array['offshore', 'inshore'],
    array['IMCA', 'BOSIET', 'OEUK Medical'],
    'IRM, UXO, and construction support. Often takes junior air divers with current tickets.',
    true,
    null,
    'active'
  ),
  (
    'boskalis',
    'Boskalis',
    'Netherlands',
    'Papendrecht',
    'https://boskalis.com',
    array['inshore', 'offshore'],
    array['IMCA', 'HSE Diver Medical'],
    'Dredging and marine construction — classic entry for fresh surface-supplied divers.',
    true,
    null,
    'active'
  ),
  (
    'van-oord',
    'Van Oord',
    'Netherlands',
    'Rotterdam',
    'https://www.vanoord.com',
    array['inshore', 'offshore'],
    array['IMCA', 'HSE Diver Medical', 'BOSIET'],
    'Marine construction and offshore wind foundations. Graduate-friendly construction scopes.',
    true,
    null,
    'active'
  ),
  (
    'deme',
    'DEME',
    'Belgium',
    'Zwijndrecht',
    'https://www.deme-group.com',
    array['inshore', 'offshore'],
    array['IMCA', 'HSE Diver Medical', 'BOSIET'],
    'Dredging, offshore energy, and environmental works. Large EU contractor network.',
    true,
    null,
    'active'
  ),
  (
    'fugro',
    'Fugro',
    'Netherlands',
    'Leidschendam / Aberdeen',
    'https://www.fugro.com',
    array['offshore'],
    array['IMCA', 'BOSIET', 'OEUK Medical', 'PCN NDT'],
    'Survey and geotech; inspection divers and ROV-adjacent. Prefer current offshore tickets.',
    false,
    null,
    'active'
  ),
  (
    'deepocean',
    'DeepOcean',
    'Norway',
    'Haugesund / North Sea',
    'https://www.deepoceangroup.com',
    array['offshore'],
    array['IMCA', 'BOSIET', 'OEUK Medical'],
    'Subsea IRM and construction support on the NCS and North Sea.',
    false,
    null,
    'active'
  ),
  (
    'oceaneering',
    'Oceaneering',
    'UK',
    'Aberdeen / Stavanger',
    'https://www.oceaneering.com',
    array['offshore'],
    array['IMCA', 'BOSIET', 'OEUK Medical', 'DMT'],
    'Subsea services and ROV; DMT and inspection paths. Less junior air-dive entry.',
    false,
    null,
    'active'
  ),
  (
    'subsea7',
    'Subsea 7',
    'UK',
    'Aberdeen / Stavanger',
    'https://www.subsea7.com',
    array['offshore'],
    array['IMCA', 'BOSIET', 'OEUK Medical'],
    'Major EPCI / IRM. Competitive; strong tickets and experience expected.',
    false,
    null,
    'active'
  ),
  (
    'reinertsen-new-energy',
    'Reinertsen New Energy',
    'Norway',
    'Trondheim / Norway',
    'https://www.reinertsen.com',
    array['offshore', 'inshore'],
    array['IMCA', 'BOSIET', 'OEUK Medical'],
    'Norwegian energy and marine works — useful Nordic graduate target.',
    true,
    null,
    'active'
  ),
  (
    'baltic-diving',
    'Baltic Diving Company',
    'Poland',
    'South Baltic',
    null,
    array['inshore'],
    array['IMCA', 'HSE Diver Medical'],
    'Placeholder for Baltic harbour / inshore construction contacts. Add verified careers email when known.',
    true,
    null,
    'active'
  ),
  (
    'stena-recycling-marine',
    'Stena Recycling (marine / salvage adjacent)',
    'Sweden',
    'Sweden / Baltic',
    'https://www.stenarecycling.com',
    array['inshore'],
    array['IMCA', 'HSE Diver Medical'],
    'Nordic industrial / marine environment work. Confirm diving desk before apply_email.',
    true,
    null,
    'active'
  ),
  (
    'interdive-employers',
    'Interdive employer network (UK)',
    'UK',
    'United Kingdom',
    'https://interdive.co.uk',
    array['inshore', 'offshore'],
    array['IMCA', 'HSE Diver Medical', 'BOSIET'],
    'Training group with industry links — use for graduate intros; set apply_email when a desk is named.',
    true,
    null,
    'active'
  ),
  (
    'cdt-employer-links',
    'Commercial Diver Training — employer links',
    'UK',
    'Cornwall / UK',
    'https://www.commercialdivertraining.co.uk',
    array['inshore', 'offshore'],
    array['IMCA', 'HSE Diver Medical'],
    'School careers coaching + UK employer intros for air divers. Not a contractor; browse for leads until a named inbox is added.',
    true,
    null,
    'active'
  ),
  (
    'bc-opleidingen-employers',
    'BC-opleidingen employer network',
    'Netherlands',
    'Enkhuizen',
    'https://www.bc-opleidingen.nl',
    array['inshore', 'offshore'],
    array['IMCA', 'HSE Diver Medical'],
    'Dutch school network into NL contractors. Add company desks as verified emails appear.',
    true,
    null,
    'active'
  ),
  (
    'nyd-employer-links',
    'NYD graduate employer path',
    'Norway',
    'Fagerstrand / Norway',
    'https://nyd.no/',
    array['offshore', 'inshore'],
    array['IMCA', 'BOSIET', 'OEUK Medical'],
    'Norsk Yrkesdykkerskole alumni / Havtil path. Ops to attach named Norwegian contractor inboxes over time.',
    true,
    null,
    'active'
  )
on conflict (slug) do nothing;
