create extension if not exists "uuid-ossp";

create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  role text not null check (role in ('diver','company','admin')),
  email text unique not null,
  username text unique,
  full_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.diver_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  headline text,
  bio text,
  sat_hours int default 0,
  dive_hours int default 0,
  welding_tickets text[] default '{}',
  certifications jsonb default '[]'::jsonb,
  medical_expiry date,
  availability_status text default 'available',
  location text,
  mobilization_notice text,
  public_visibility jsonb default '{"showBio": true, "showCerts": true}'::jsonb,
  verified boolean default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.companies (
  user_id uuid primary key references public.users(id) on delete cascade,
  company_name text not null,
  subscription_status text default 'inactive',
  stripe_customer_id text,
  plan text default '149',
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(user_id) on delete cascade,
  title text not null,
  description text not null,
  location text,
  start_date date,
  required_certs text[] default '{}',
  budget_range text,
  status text default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid references public.jobs(id) on delete cascade,
  diver_id uuid references public.diver_profiles(user_id) on delete cascade,
  status text default 'pending',
  cover_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  sender_id uuid references public.users(id) on delete cascade,
  recipient_id uuid references public.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.forum_posts (
  id uuid primary key default uuid_generate_v4(),
  author_id uuid references public.users(id) on delete cascade,
  category text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.forum_comments (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid references public.forum_posts(id) on delete cascade,
  author_id uuid references public.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_interactions (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid,
  feature text not null,
  input text not null,
  output jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.diver_profiles enable row level security;
alter table public.companies enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
alter table public.messages enable row level security;
alter table public.forum_posts enable row level security;
alter table public.forum_comments enable row level security;
alter table public.ai_interactions enable row level security;

create policy "users can read own profile" on public.users
for select using (auth.uid() = id);

create policy "diver profile public read" on public.diver_profiles
for select using (true);

create policy "diver updates own profile" on public.diver_profiles
for update using (auth.uid() = user_id);

create policy "company jobs public teaser read" on public.jobs
for select using (true);

create policy "company manages own jobs" on public.jobs
for all using (auth.uid() = company_id);

create policy "divers read/write own applications" on public.applications
for all using (auth.uid() = diver_id);

create policy "message participants access" on public.messages
for select using (auth.uid() = sender_id or auth.uid() = recipient_id);

create policy "verified divers forum read" on public.forum_posts
for select using (
  exists (
    select 1 from public.diver_profiles d where d.user_id = auth.uid() and d.verified = true
  )
);

create policy "admin full ai interaction access" on public.ai_interactions
for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

-- Future agent architecture: ai_interactions can be linked to `agent_threads` for
-- one AI assistant per diver/company (LangGraph-compatible orchestration).
