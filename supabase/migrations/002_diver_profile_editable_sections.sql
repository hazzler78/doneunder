alter table public.diver_profiles
  add column if not exists headline_source text not null default 'manual' check (headline_source in ('manual', 'ai', 'linkedin')),
  add column if not exists headline_source_ref text,
  add column if not exists bio_source text not null default 'manual' check (bio_source in ('manual', 'ai', 'linkedin')),
  add column if not exists bio_source_ref text,
  add column if not exists import_batch_id uuid,
  add column if not exists last_verified_at timestamptz;

create table if not exists public.diver_experiences (
  id uuid primary key default uuid_generate_v4(),
  diver_id uuid not null references public.diver_profiles(user_id) on delete cascade,
  company text not null,
  project_name text,
  location text,
  role_title text not null,
  date_start date,
  date_end date,
  summary text,
  sort_order int not null default 0,
  source text not null default 'manual' check (source in ('manual', 'ai', 'linkedin')),
  source_ref text,
  import_batch_id uuid,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.diver_certifications (
  id uuid primary key default uuid_generate_v4(),
  diver_id uuid not null references public.diver_profiles(user_id) on delete cascade,
  name text not null,
  issue_date date,
  expiry_date date,
  cert_number text,
  issuing_body text,
  sort_order int not null default 0,
  source text not null default 'manual' check (source in ('manual', 'ai', 'linkedin')),
  source_ref text,
  import_batch_id uuid,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.diver_references (
  id uuid primary key default uuid_generate_v4(),
  diver_id uuid not null references public.diver_profiles(user_id) on delete cascade,
  name text not null,
  company text,
  phone text not null,
  email text,
  sort_order int not null default 0,
  source text not null default 'manual' check (source in ('manual', 'ai', 'linkedin')),
  source_ref text,
  import_batch_id uuid,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.diver_experiences enable row level security;
alter table public.diver_certifications enable row level security;
alter table public.diver_references enable row level security;

create policy "diver inserts own profile" on public.diver_profiles
for insert with check (auth.uid() = user_id);

create policy "diver reads own experiences" on public.diver_experiences
for select using (auth.uid() = diver_id);
create policy "diver manages own experiences" on public.diver_experiences
for all using (auth.uid() = diver_id) with check (auth.uid() = diver_id);

create policy "diver reads own certifications" on public.diver_certifications
for select using (auth.uid() = diver_id);
create policy "diver manages own certifications" on public.diver_certifications
for all using (auth.uid() = diver_id) with check (auth.uid() = diver_id);

create policy "diver reads own references" on public.diver_references
for select using (auth.uid() = diver_id);
create policy "diver manages own references" on public.diver_references
for all using (auth.uid() = diver_id) with check (auth.uid() = diver_id);
