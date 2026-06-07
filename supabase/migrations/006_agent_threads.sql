create table if not exists public.agent_threads (
  id uuid primary key default uuid_generate_v4(),
  diver_id uuid not null references public.diver_profiles(user_id) on delete cascade,
  channel text not null check (channel in ('telegram', 'web')),
  external_chat_id text not null,
  last_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (channel, external_chat_id)
);

create index if not exists agent_threads_diver_id_idx on public.agent_threads (diver_id);

alter table public.agent_threads enable row level security;

-- Agent/Hermes traffic uses service role and bypasses RLS.
-- No public policies are defined intentionally.

comment on table public.agent_threads is
  'Maps external chat sessions (e.g. Telegram chat_id) to diver profiles for Hermes agents.';
