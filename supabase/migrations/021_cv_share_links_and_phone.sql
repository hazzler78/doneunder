-- Per-application private CV share links + optional diver contact phone.

alter table public.diver_profiles
  add column if not exists phone text;

comment on column public.diver_profiles.phone is
  'Optional mobile/phone for employer contact. Shown on CV PDFs Hermes sends, not on public teaser pages.';

create table if not exists public.cv_share_links (
  id uuid primary key default gen_random_uuid(),
  diver_id uuid not null references public.users (id) on delete cascade,
  token_hash text not null unique,
  recipient_email text not null,
  job_id text,
  company_id uuid references public.diving_companies (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists cv_share_links_diver_id_idx on public.cv_share_links (diver_id);
create index if not exists cv_share_links_active_lookup_idx on public.cv_share_links (token_hash)
  where revoked_at is null;

comment on table public.cv_share_links is
  'Unguessable tokens for employers to view a diver full CV without a company account. Created by Hermes on apply; validated server-side with service role.';

alter table public.cv_share_links enable row level security;

drop policy if exists "diver reads own cv share links" on public.cv_share_links;
create policy "diver reads own cv share links" on public.cv_share_links
for select using (auth.uid() = diver_id);

drop policy if exists "diver revokes own cv share links" on public.cv_share_links;
create policy "diver revokes own cv share links" on public.cv_share_links
for update using (auth.uid() = diver_id)
with check (auth.uid() = diver_id);
