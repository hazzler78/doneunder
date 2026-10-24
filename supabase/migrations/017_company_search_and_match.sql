-- Company "Search & Match" (additive). Safe to apply before the app deploy.
-- Tables: company_searches (30-min search token), match_reveals (one reveal per search).
-- Writes happen only through security-definer RPCs search_divers / reveal_match.

create table if not exists public.company_searches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(user_id) on delete cascade,
  criteria jsonb not null,
  result_diver_ids uuid[] not null,          -- server-side only, never returned to clients by the RPCs
  result_count int not null,
  revealed boolean not null default false,
  expires_at timestamptz not null default now() + interval '30 minutes',
  created_at timestamptz not null default now()
);

create table if not exists public.match_reveals (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null unique references public.company_searches(id) on delete cascade,
  company_id uuid not null references public.companies(user_id) on delete cascade,
  diver_id uuid not null references public.users(id) on delete cascade,
  slot int not null,
  criteria jsonb not null,
  created_at timestamptz not null default now()
);

-- Every anonymous match shown to a company is logged (one row per teaser slot).
create table if not exists public.company_search_matches (
  id bigint generated always as identity primary key,
  search_id uuid not null references public.company_searches(id) on delete cascade,
  company_id uuid not null references public.companies(user_id) on delete cascade,
  diver_id uuid not null references public.users(id) on delete cascade,
  slot int not null,
  score numeric not null,
  created_at timestamptz not null default now(),
  unique (search_id, slot)
);

create index if not exists company_searches_company_created_idx on public.company_searches (company_id, created_at desc);
create index if not exists match_reveals_company_created_idx on public.match_reveals (company_id, created_at desc);
create index if not exists match_reveals_diver_idx on public.match_reveals (diver_id);
create index if not exists company_search_matches_diver_idx on public.company_search_matches (diver_id, created_at desc);

alter table public.company_searches enable row level security;
alter table public.match_reveals enable row level security;
alter table public.company_search_matches enable row level security;

-- Companies see their own searches/reveals; admins see everything. No write policies.
-- result_diver_ids is hidden from companies via column privileges below.
drop policy if exists "company reads own searches" on public.company_searches;
create policy "company reads own searches" on public.company_searches
for select using (company_id = auth.uid());

drop policy if exists "admin reads all searches" on public.company_searches;
create policy "admin reads all searches" on public.company_searches
for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop policy if exists "company reads own reveals" on public.match_reveals;
create policy "company reads own reveals" on public.match_reveals
for select using (company_id = auth.uid());

drop policy if exists "admin reads all reveals" on public.match_reveals;
create policy "admin reads all reveals" on public.match_reveals
for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop policy if exists "admin reads all search matches" on public.company_search_matches;
create policy "admin reads all search matches" on public.company_search_matches
for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- Column-level: companies must never read raw result ids.
revoke all on public.company_searches from anon, authenticated;
grant select (id, company_id, criteria, result_count, revealed, expires_at, created_at)
  on public.company_searches to authenticated;
revoke all on public.match_reveals from anon;
revoke insert, update, delete on public.match_reveals from authenticated;
grant select on public.match_reveals to authenticated;
revoke all on public.company_search_matches from anon;
revoke insert, update, delete on public.company_search_matches from authenticated;
grant select on public.company_search_matches to authenticated;

-- Admin needs to read companies for the activity view (companies had no policies).
drop policy if exists "admin reads companies" on public.companies;
create policy "admin reads companies" on public.companies
for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
