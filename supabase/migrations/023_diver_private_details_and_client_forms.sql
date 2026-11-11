-- Private diver records (passport, DOB, address, biometrics consent) and client form drafts.
-- Not exposed on public ambassador views or living CV PDF.

create table if not exists public.diver_private_details (
  user_id uuid primary key references public.users (id) on delete cascade,
  nationality text,
  date_of_birth date,
  home_address text,
  mobilization_airport text,
  height_cm smallint,
  weight_kg smallint,
  blood_group text,
  seaman_book jsonb,
  passports jsonb,
  signature_storage_path text,
  sensitive_data_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.diver_private_details is
  'Sensitive diver fields for client onboarding forms. RLS: diver (and admin) only.';
comment on column public.diver_private_details.passports is
  'Array of {number, issue_date, expiry_date, label?} — max 2 typical for Beacon CV.';
comment on column public.diver_private_details.seaman_book is
  'Object {number, issue_date, expiry_date}.';
comment on column public.diver_private_details.signature_storage_path is
  'Path under diver-documents bucket, e.g. {userId}/private/signature.png';

alter table public.diver_private_details enable row level security;

drop policy if exists "diver reads own private details" on public.diver_private_details;
create policy "diver reads own private details" on public.diver_private_details
for select using (auth.uid() = user_id);

drop policy if exists "diver upserts own private details" on public.diver_private_details;
create policy "diver upserts own private details" on public.diver_private_details
for insert with check (auth.uid() = user_id);

drop policy if exists "diver updates own private details" on public.diver_private_details;
create policy "diver updates own private details" on public.diver_private_details
for update using (auth.uid() = user_id);

drop policy if exists "admin reads diver private details" on public.diver_private_details;
create policy "admin reads diver private details" on public.diver_private_details
for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

create table if not exists public.diver_education (
  id uuid primary key default gen_random_uuid(),
  diver_id uuid not null references public.users (id) on delete cascade,
  degree text not null default '',
  institute text not null default '',
  year_completed text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists diver_education_diver_id_idx on public.diver_education (diver_id);

alter table public.diver_education enable row level security;

drop policy if exists "diver manages own education" on public.diver_education;
create policy "diver manages own education" on public.diver_education
for all using (auth.uid() = diver_id)
with check (auth.uid() = diver_id);

drop policy if exists "admin reads diver education" on public.diver_education;
create policy "admin reads diver education" on public.diver_education
for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

alter table public.diver_experiences
  add column if not exists client_name text,
  add column if not exists rig_vessel_name text,
  add column if not exists work_scope text,
  add column if not exists scope_system text;

create table if not exists public.diver_client_forms (
  id uuid primary key default gen_random_uuid(),
  diver_id uuid not null references public.users (id) on delete cascade,
  form_kind text not null,
  template_label text,
  template_storage_path text,
  output_storage_path text not null,
  output_filename text not null,
  output_content_type text not null,
  status text not null default 'pending_approval'
    check (status in ('pending_approval', 'approved', 'rejected', 'sent')),
  consent_snapshot jsonb,
  missing_fields jsonb,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create index if not exists diver_client_forms_diver_id_idx on public.diver_client_forms (diver_id);

alter table public.diver_client_forms enable row level security;

drop policy if exists "diver manages own client forms" on public.diver_client_forms;
create policy "diver manages own client forms" on public.diver_client_forms
for all using (auth.uid() = diver_id)
with check (auth.uid() = diver_id);

drop policy if exists "admin reads diver client forms" on public.diver_client_forms;
create policy "admin reads diver client forms" on public.diver_client_forms
for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
