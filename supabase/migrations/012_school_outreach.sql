create table if not exists public.school_outreach_targets (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  name text not null,
  priority smallint not null default 1,
  location text,
  country text,
  website text,
  notes text,
  status text not null default 'todo'
    check (status in ('todo', 'contacted', 'replied', 'partner', 'skip')),
  contact_name text,
  contact_email text,
  contact_note text,
  last_contacted_at timestamptz,
  last_contacted_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists school_outreach_targets_status_idx
  on public.school_outreach_targets (status, priority, name);

create table if not exists public.school_outreach_contacts (
  id uuid primary key default uuid_generate_v4(),
  target_id uuid not null references public.school_outreach_targets(id) on delete cascade,
  contacted_by uuid references public.users(id) on delete set null,
  channel text not null default 'email'
    check (channel in ('email', 'phone', 'visit', 'other')),
  summary text not null,
  contact_email text,
  created_at timestamptz not null default now()
);

create index if not exists school_outreach_contacts_target_idx
  on public.school_outreach_contacts (target_id, created_at desc);

alter table public.school_outreach_targets enable row level security;
alter table public.school_outreach_contacts enable row level security;

comment on table public.school_outreach_targets is
  'Commercial diving schools for DoneUnder outreach. Updated via Hermes ops tools (service role).';
comment on table public.school_outreach_contacts is
  'Contact log entries when ops reaches out to a school target.';

insert into public.school_outreach_targets (slug, name, priority, location, country, website, notes, status)
values
  ('pda', 'Professional Diving Academy (PDA)', 1, 'Scotland', 'UK', 'https://www.professionaldivingacademy.com', 'HSE Scuba / Surface Supplied / Top-Up; ADC sister co Shearwater; graduate CV + employer list help', 'todo'),
  ('cdt', 'Commercial Diver Training Ltd (CDT)', 1, 'Cornwall', 'UK', 'https://www.commercialdivertraining.co.uk', 'HSE assessor all commercial air quals England & Wales; careers coaching + CV help', 'todo'),
  ('interdive-uk', 'Interdive UK Ltd', 1, 'UK', 'UK', 'https://interdive.co.uk', 'HSE / IMCA / IDSA / ADC listed training', 'todo'),
  ('andark', 'Andark Diving and Watersports', 1, 'Southampton', 'UK', 'https://www.andark.co.uk', 'HSE Professional Scuba entry path', 'todo'),
  ('bristol-channel-diving', 'Bristol Channel Diving Services', 1, 'Cardiff', 'UK', null, 'HSE SCUBA assessor (HSE list)', 'todo'),
  ('deep-tidenham', 'DEEP', 1, 'Tidenham', 'UK', null, 'HSE Closed Bell — advanced / sat path (later wave)', 'todo'),
  ('bc-opleidingen', 'BC-opleidingen', 2, 'Enkhuizen', 'Netherlands', 'https://www.bc-opleidingen.nl', 'NDC-RI / Hobéon-SKO; IMCA-recognised Dutch scheme; English courses', 'todo'),
  ('foundation-nok', 'Foundation NOK', 2, 'Netherlands', 'Netherlands', null, 'IDSA Level 3 full member', 'todo'),
  ('nyd', 'Norsk Yrkesdykkerskole (NYD)', 1, 'Fagerstrand (Oslo area)', 'Norway', 'https://nyd.no/', 'IDSA Level 4; Havtil/NPD path. Gareth trained here — strong personal intro. Contact: info@nyd.no', 'todo'),
  ('hvl-diver-education', 'HVL Diver Education', 2, 'Western Norway', 'Norway', null, 'Western Norway University of Applied Sciences; IDSA Level 3', 'todo'),
  ('yrgo', 'YRGO Commercial Diving School of Gothenburg', 2, 'Gothenburg', 'Sweden', null, 'IDSA Level 3; Swedish B50 VK path', 'todo'),
  ('ens', 'Ecole Nationale des Scaphandriers (ENS)', 2, 'France', 'France', null, 'IDSA Level 3', 'todo'),
  ('cedifop', 'Centro Studi CEDIFOP', 2, 'Palermo', 'Italy', null, 'IDSA Level 3; IMCA diving division member', 'todo'),
  ('oceanos-spain', 'Oceanos Escuela de Buceo Profesional', 2, 'Spain', 'Spain', null, 'IDSA Level 3', 'todo'),
  ('cda-bilbao', 'CDA Bilbao', 2, 'Bilbao', 'Spain', null, 'Spanish commercial titles (shallow / medium depth)', 'todo'),
  ('hellenic-commercial-diving', 'Hellenic Commercial Diving Academy', 2, 'Greece', 'Greece', null, 'IDSA Level 3', 'todo'),
  ('sab-akvo', 'SAB AKVO', 2, 'Belgium', 'Belgium', null, 'IDSA Level 3', 'todo'),
  ('luksia', 'Luksia Sukellusala', 2, 'Finland', 'Finland', null, 'IDSA Level 2', 'todo'),
  ('osnz-frog', 'OSNZ FROG', 2, 'Poland', 'Poland', null, 'IDSA Level 2', 'todo'),
  ('irish-navy-diving', 'Irish Navy Diving School', 2, 'Ireland', 'Ireland', null, 'IDSA Level 3 — military; outreach may differ', 'todo'),
  ('jacks-dive-chest', 'Jacks Dive Chest Commercial Dive Academy', 3, 'South Africa', 'South Africa', 'https://jacksdivechest.com', 'IDSA Level 3; Class II DoL path', 'todo'),
  ('seadog', 'SEADOG / Academy of Diving and Offshore Medicine', 3, 'Saldanha', 'South Africa', 'https://www.divingschool.co.za', 'Class II offshore air; IMCA T2 training member', 'todo'),
  ('utcsa', 'Underwater Training Centre SA (UTCSA)', 4, 'Burra', 'Australia', 'https://utcsa.com.au', 'ADAS Part 1–2; job placement emphasis', 'todo'),
  ('cda-australia', 'Commercial Dive Academy (CDA)', 4, 'Tasmania (+ WA / QLD)', 'Australia', 'https://www.commercialdiveacademy.com', 'ADAS through closed bell; IMCA/IOGP sat path', 'todo'),
  ('dit', 'Divers Institute of Technology (DIT)', 5, 'Seattle, WA', 'USA', 'https://www.diversinstitute.edu', 'Major US commercial school', 'todo'),
  ('cda-technical-institute', 'CDA Technical Institute', 5, 'Jacksonville, FL', 'USA', null, 'ACDE / ADCI', 'todo'),
  ('divers-academy-international', 'Divers Academy International', 5, 'Erial, NJ', 'USA', null, 'ACDE / ADCI', 'todo'),
  ('international-diving-institute', 'International Diving Institute', 5, 'North Charleston, SC', 'USA', null, 'ACDE / ADCI', 'todo'),
  ('santa-barbara-city-college', 'Santa Barbara City College', 5, 'Santa Barbara, CA', 'USA', null, 'ACDE', 'todo'),
  ('ocean-corporation', 'The Ocean Corporation', 5, 'Houston, TX', 'USA', null, 'Classic ACDE school', 'todo'),
  ('south-central-louisiana', 'South Central Louisiana Technical College', 5, 'Morgan City, LA', 'USA', null, 'ACDE path', 'todo'),
  ('minnesota-commercial-diver', 'Minnesota Commercial Diver Training Center', 5, 'Brainerd, MN', 'USA', null, 'ADCI', 'todo'),
  ('aastmt', 'AASTMT', 6, 'Egypt', 'Egypt', null, 'IDSA Level 3', 'todo'),
  ('eids', 'Egyptian International Diving School (EIDS)', 6, 'Egypt', 'Egypt', null, 'IDSA Level 3', 'todo'),
  ('mecd', 'Middle East for Commercial Diving (MECD)', 6, 'Egypt', 'Egypt', null, 'IDSA Level 3', 'todo'),
  ('underwater-centre-fort-william', 'Underwater Centre Fort William', 0, 'Scotland', 'UK', null, 'Verify — reported closed / not training', 'skip'),
  ('inpp-france', 'INPP (France)', 0, 'France', 'France', null, 'Verify — no longer training divers', 'skip'),
  ('recreational-shops', 'Pure recreational PADI/SSI shops', 0, null, null, null, 'Out of scope', 'skip')
on conflict (slug) do nothing;
