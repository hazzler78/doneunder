-- Persistent agent conversation memory per thread (web + Telegram).

alter table public.agent_threads
  add column if not exists user_id uuid references public.users(id) on delete cascade;

update public.agent_threads
set user_id = diver_id
where user_id is null;

alter table public.agent_threads
  alter column diver_id drop not null;

alter table public.agent_threads
  alter column user_id set not null;

create index if not exists agent_threads_user_id_idx on public.agent_threads (user_id);

create table if not exists public.agent_messages (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid not null references public.agent_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (char_length(content) between 1 and 8000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_messages_thread_created_idx
  on public.agent_messages (thread_id, created_at desc);

alter table public.agent_messages enable row level security;

-- Users can read messages for their own workspace threads.
create policy "users read own agent messages" on public.agent_messages
for select using (
  exists (
    select 1
    from public.agent_threads t
    where t.id = agent_messages.thread_id
      and t.user_id = auth.uid()
  )
);

comment on table public.agent_messages is
  'Persistent Hermes conversation history scoped to one agent thread per user/session.';
