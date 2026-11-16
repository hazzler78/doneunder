-- Same-day guard for outbound mail from hello@doneunder.ai.
-- Incident spur: 2026-10-30 Jonny (post@rovogdykk.no) got two hello@ emails ~1h apart.

create table if not exists public.hello_outbound_sends (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  day_berlin date not null,
  subject text,
  feature text,
  resend_id text,
  from_header text,
  created_at timestamptz not null default now()
);

create index if not exists hello_outbound_sends_recipient_day_idx
  on public.hello_outbound_sends (recipient_email, day_berlin);

create table if not exists public.hello_outbound_approvals (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  day_berlin date not null,
  note text,
  approved_by text not null default 'mikael',
  created_at timestamptz not null default now(),
  unique (recipient_email, day_berlin)
);

create table if not exists public.hello_outbound_blocks (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  day_berlin date not null,
  subject text,
  feature text,
  reason text not null,
  prior_send_count integer,
  created_at timestamptz not null default now()
);

create index if not exists hello_outbound_blocks_recipient_day_idx
  on public.hello_outbound_blocks (recipient_email, day_berlin, created_at desc);

alter table public.hello_outbound_sends enable row level security;
alter table public.hello_outbound_approvals enable row level security;
alter table public.hello_outbound_blocks enable row level security;

comment on table public.hello_outbound_sends is
  'Successful Resend outbounds whose From address was hello@doneunder.ai (platform or relay).';
comment on table public.hello_outbound_approvals is
  'Mikael written go-ahead for a second hello@ send to the same recipient on day_berlin (Europe/Berlin).';
comment on table public.hello_outbound_blocks is
  'Blocked hello@ outbound attempts (same recipient already mailed that Berlin calendar day without approval).';
