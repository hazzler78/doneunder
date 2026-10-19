-- Connected mailboxes for Hermes outbound/inbound email (Gmail / Outlook OAuth).
create table if not exists public.connected_mailboxes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null check (provider in ('gmail', 'outlook')),
  email text not null,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists connected_mailboxes_user_id_idx on public.connected_mailboxes (user_id);
create index if not exists connected_mailboxes_email_idx on public.connected_mailboxes (email);

alter table public.connected_mailboxes enable row level security;

-- No policies: tokens are only accessed via service role from server routes / Hermes.

comment on table public.connected_mailboxes is
  'OAuth-connected Gmail/Outlook mailboxes used by Hermes to send/receive as the logged-in user.';
