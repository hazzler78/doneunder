-- 022 Billing (Stripe). Additive; safe to apply before the app deploy.
--
-- Two ways for a company to get Search & Match access:
--   1. Unlimited (USD 250/month, Stripe subscription): companies.subscription_status = 'active'.
--      Fair use stays as before: 20 searches/hour and 100/day (enforced in search_divers).
--   2. One-time search (USD 190, Stripe one-off payment): one row in search_entitlements that
--      grants exactly ONE search, usable within 30 days of payment (expires_at). The search token
--      created with it (and the reveal + full CV of the revealed diver) stays valid until that same
--      expires_at, instead of the normal 30-minute token.
--
-- All billing writes come from the Stripe webhook using the service role. Companies can only read.

-- ---------------------------------------------------------------------------
-- companies: Stripe subscription fields (stripe_customer_id already exists since 001)
-- ---------------------------------------------------------------------------
alter table public.companies add column if not exists stripe_subscription_id text;
alter table public.companies add column if not exists stripe_subscription_status text;
alter table public.companies add column if not exists subscription_current_period_end timestamptz;
alter table public.companies add column if not exists subscription_cancel_at_period_end boolean not null default false;
alter table public.companies add column if not exists billing_updated_at timestamptz;

create unique index if not exists companies_stripe_customer_id_key
  on public.companies (stripe_customer_id) where stripe_customer_id is not null;
create index if not exists companies_stripe_subscription_id_idx
  on public.companies (stripe_subscription_id) where stripe_subscription_id is not null;

-- ---------------------------------------------------------------------------
-- One-time search entitlements (one row per paid Checkout Session)
-- ---------------------------------------------------------------------------
create table if not exists public.search_entitlements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(user_id) on delete cascade,
  checkout_session_id text not null unique,          -- idempotency: one entitlement per session
  payment_intent_id text,
  amount_total int,                                   -- minor units, incl. tax
  currency text,
  purchased_at timestamptz not null default now(),
  expires_at timestamptz not null,                    -- purchased_at + 30 days
  used_at timestamptz,
  search_id uuid references public.company_searches(id) on delete set null,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists search_entitlements_company_open_idx
  on public.search_entitlements (company_id, expires_at)
  where used_at is null and refunded_at is null;
create index if not exists search_entitlements_search_idx on public.search_entitlements (search_id);
create index if not exists search_entitlements_payment_intent_idx on public.search_entitlements (payment_intent_id);

alter table public.search_entitlements enable row level security;

drop policy if exists "company reads own entitlements" on public.search_entitlements;
create policy "company reads own entitlements" on public.search_entitlements
  for select to authenticated using (company_id = auth.uid());

drop policy if exists "admin reads all entitlements" on public.search_entitlements;
create policy "admin reads all entitlements" on public.search_entitlements
  for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

revoke all on public.search_entitlements from anon;
revoke insert, update, delete on public.search_entitlements from authenticated;
grant select on public.search_entitlements to authenticated;

-- ---------------------------------------------------------------------------
-- Stripe webhook idempotency log (service role only)
-- ---------------------------------------------------------------------------
create table if not exists public.stripe_events (
  id text primary key,                                -- Stripe event id (evt_...)
  type text not null,
  livemode boolean not null default false,
  status text not null default 'processing',          -- processing | processed | failed
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
create or replace function public._company_has_active_subscription(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.companies c
    where c.user_id = p_company
      and lower(coalesce(trim(c.subscription_status), 'inactive')) = 'active'
  );
$$;

create or replace function public._company_has_open_entitlement(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.search_entitlements e
    where e.company_id = p_company
      and e.used_at is null and e.refunded_at is null
      and e.expires_at > now()
  );
$$;

-- Caller must be a company user. Returns the company id (= auth.uid()).
create or replace function public._assert_company_user()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.users u
    join public.companies c on c.user_id = u.id
    where u.id = v_uid and u.role = 'company'
  ) then
    raise exception 'company_subscription_required' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- Kept for backwards compatibility: now passes on an active subscription OR an open one-time entitlement.
create or replace function public._assert_active_company()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._assert_company_user();
begin
  if not (public._company_has_active_subscription(v_uid) or public._company_has_open_entitlement(v_uid)) then
    raise exception 'company_subscription_required' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- Company-facing billing summary (own row only).
create or replace function public.company_billing_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := public._assert_company_user();
  v_result jsonb;
begin
  select jsonb_build_object(
    'subscription_active', public._company_has_active_subscription(v_uid),
    'subscription_status', c.subscription_status,
    'current_period_end', c.subscription_current_period_end,
    'cancel_at_period_end', c.subscription_cancel_at_period_end,
    'has_stripe_customer', c.stripe_customer_id is not null,
    'open_one_time_searches', (
      select count(*) from public.search_entitlements e
      where e.company_id = v_uid and e.used_at is null and e.refunded_at is null and e.expires_at > now()),
    'next_one_time_expiry', (
      select min(e.expires_at) from public.search_entitlements e
      where e.company_id = v_uid and e.used_at is null and e.refunded_at is null and e.expires_at > now())
  ) into v_result
  from public.companies c where c.user_id = v_uid;
  return v_result;
end;
$$;

-- search_divers: same as 018, plus entitlement handling.
create or replace function public.search_divers(p_criteria jsonb)
returns table (search_id uuid, slot int, teaser jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public._assert_company_user();
  v_subscribed boolean;
  v_entitlement public.search_entitlements%rowtype;
  v_criteria jsonb := coalesce(p_criteria, '{}'::jsonb);
  v_certs text[];
  v_welding text[];
  v_until date;
  v_location text;
  v_min_dive int;
  v_min_sat int;
  v_available_only boolean;
  v_verified_only boolean;
  v_hour_count int;
  v_day_count int;
  v_search uuid;
  v_ids uuid[];
begin
  -- Serialize per company so concurrent calls cannot bypass the rate limit.
  perform pg_advisory_xact_lock(hashtext('search_divers:' || v_company::text));

  -- Access: active subscription (unlimited, fair use below) OR one open one-time entitlement.
  v_subscribed := public._company_has_active_subscription(v_company);
  if not v_subscribed then
    select * into v_entitlement
    from public.search_entitlements e
    where e.company_id = v_company
      and e.used_at is null and e.refunded_at is null
      and e.expires_at > now()
    order by e.expires_at asc
    limit 1
    for update;
    if not found then
      raise exception 'company_subscription_required' using errcode = '42501';
    end if;
  end if;

  select count(*) filter (where s.created_at > now() - interval '1 hour'),
         count(*) filter (where s.created_at > now() - interval '1 day')
    into v_hour_count, v_day_count
  from public.company_searches s
  where s.company_id = v_company and s.created_at > now() - interval '1 day';

  if v_hour_count >= 20 or v_day_count >= 100 then
    raise exception 'rate_limited' using errcode = 'P0001',
      hint = 'Max 20 searches per hour and 100 per day.';
  end if;

  select coalesce(array_agg(lower(trim(x))) filter (where trim(x) <> ''), '{}')
    into v_certs from jsonb_array_elements_text(coalesce(v_criteria->'certs', '[]'::jsonb)) x;
  select coalesce(array_agg(lower(trim(x))) filter (where trim(x) <> ''), '{}')
    into v_welding from jsonb_array_elements_text(coalesce(v_criteria->'welding', '[]'::jsonb)) x;
  v_certs := v_certs[1:10];
  v_welding := v_welding[1:10];
  v_until := greatest(coalesce(nullif(v_criteria->>'needed_until', '')::date, current_date), current_date);
  v_location := nullif(left(trim(coalesce(v_criteria->>'location', '')), 80), '');
  v_min_dive := greatest(coalesce(nullif(v_criteria->>'min_dive_hours', '')::int, 0), 0);
  v_min_sat := greatest(coalesce(nullif(v_criteria->>'min_sat_hours', '')::int, 0), 0);
  v_available_only := coalesce((v_criteria->>'available_only')::boolean, true);
  v_verified_only := coalesce((v_criteria->>'verified_only')::boolean, false);

  v_criteria := jsonb_build_object(
    'certs', to_jsonb(v_certs), 'welding', to_jsonb(v_welding), 'needed_until', v_until,
    'location', v_location, 'min_dive_hours', v_min_dive, 'min_sat_hours', v_min_sat,
    'available_only', v_available_only, 'verified_only', v_verified_only);

  create temp table if not exists _sd_matches (diver_id uuid, score numeric, slot int, teaser jsonb) on commit drop;
  truncate _sd_matches;

  insert into _sd_matches (diver_id, score, slot, teaser)
  select m.user_id, m.score, row_number() over (order by m.score desc, random())::int, m.teaser
  from (
    select dp.user_id,
      (coalesce(cert.valid_count, 0)
        + least(coalesce(dp.dive_hours, 0), 5000) / 1000.0
        + least(coalesce(dp.sat_hours, 0), 5000) / 1000.0
        + case when lower(coalesce(dp.availability_status, '')) = 'available' then 2 else 0 end
        + case when coalesce(dp.verified, false) then 1 else 0 end)::numeric as score,
      jsonb_build_object(
        'certs_valid', coalesce(cert.valid_count, 0),
        'dive_hours_band', public._hours_band(dp.dive_hours),
        'sat_hours_band', public._hours_band(dp.sat_hours),
        'available', lower(coalesce(dp.availability_status, '')) = 'available',
        'verified', coalesce(dp.verified, false),
        'medical_valid', dp.medical_expiry is not null and dp.medical_expiry >= v_until,
        'welding', coalesce(array_length(dp.welding_tickets, 1), 0) > 0
      ) as teaser
    from public.diver_profiles dp
    left join lateral (
      select count(*)::int as valid_count
      from public.diver_certifications c
      where c.diver_id = dp.user_id
        and (c.expiry_date is null or c.expiry_date >= v_until)
    ) cert on true
    where dp.profile_status = 'published'
      and (not v_available_only or lower(coalesce(dp.availability_status, '')) = 'available')
      and (not v_verified_only or coalesce(dp.verified, false))
      and (dp.medical_expiry is null or dp.medical_expiry >= v_until)
      and coalesce(dp.dive_hours, 0) >= v_min_dive
      and coalesce(dp.sat_hours, 0) >= v_min_sat
      and (v_location is null or dp.location ilike '%' || replace(replace(v_location, '%', ''), '_', '') || '%')
      and (cardinality(v_welding) = 0 or exists (
        select 1 from unnest(coalesce(dp.welding_tickets, '{}')) w, unnest(v_welding) want
        where lower(w) like '%' || want || '%'))
      and not exists (
        select 1 from unnest(v_certs) want
        where not exists (
          select 1 from public.diver_certifications c
          where c.diver_id = dp.user_id
            and lower(c.name) like '%' || want || '%'
            and c.expiry_date is not null and c.expiry_date >= v_until))
  ) m
  order by m.score desc, random()
  limit 10;

  select coalesce(array_agg(t.diver_id order by t.slot), '{}') into v_ids from _sd_matches t;

  -- One-time searches keep their token (reveal + CV) until the entitlement expires (30 days from payment).
  insert into public.company_searches (company_id, criteria, result_diver_ids, result_count, expires_at)
  values (v_company, v_criteria, v_ids, cardinality(v_ids),
    case when v_subscribed then now() + interval '30 minutes' else v_entitlement.expires_at end)
  returning id into v_search;

  -- Consume the one-time entitlement only when the search actually returned matches.
  if not v_subscribed and cardinality(v_ids) > 0 then
    update public.search_entitlements
       set used_at = now(), search_id = v_search
     where id = v_entitlement.id;
  end if;

  insert into public.company_search_matches (search_id, company_id, diver_id, slot, score)
  select v_search, v_company, t.diver_id, t.slot, t.score from _sd_matches t;

  return query select v_search, t.slot, t.teaser from _sd_matches t order by t.slot;
end;
$$;

create or replace function public.reveal_match(p_search_id uuid, p_slot int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public._assert_company_user();
  v_search public.company_searches%rowtype;
  v_diver uuid;
  v_card jsonb;
begin
  select * into v_search from public.company_searches s where s.id = p_search_id for update;
  if not found or v_search.company_id <> v_company then
    raise exception 'search_not_found' using errcode = 'P0002';
  end if;
  -- Access: active subscription, or this search was paid with a still-valid one-time entitlement.
  if not public._company_has_active_subscription(v_company) and not exists (
    select 1 from public.search_entitlements e
    where e.company_id = v_company and e.search_id = v_search.id
      and e.refunded_at is null and e.expires_at > now()
  ) then
    raise exception 'company_subscription_required' using errcode = '42501';
  end if;
  if v_search.expires_at < now() then
    raise exception 'search_expired' using errcode = 'P0001';
  end if;
  if v_search.revealed then
    raise exception 'already_revealed' using errcode = 'P0001',
      hint = 'Run a new search to reveal another diver.';
  end if;
  if p_slot is null or p_slot < 1 or p_slot > coalesce(cardinality(v_search.result_diver_ids), 0) then
    raise exception 'invalid_slot' using errcode = '22023';
  end if;

  v_diver := v_search.result_diver_ids[p_slot];

  insert into public.match_reveals (search_id, company_id, diver_id, slot, criteria)
  values (v_search.id, v_company, v_diver, p_slot, v_search.criteria);
  update public.company_searches set revealed = true where id = v_search.id;

  select jsonb_build_object(
    'full_name', u.full_name,
    'username', u.username,
    'headline', dp.headline,
    'location', dp.location,
    'availability_status', dp.availability_status,
    'mobilization_notice', dp.mobilization_notice,
    'dive_hours', dp.dive_hours,
    'sat_hours', dp.sat_hours,
    'verified', coalesce(dp.verified, false),
    'certifications', case
      when coalesce((dp.public_visibility->>'showCerts')::boolean, true) then coalesce((
        select jsonb_agg(jsonb_build_object('name', c.name, 'expiry_date', c.expiry_date) order by c.sort_order)
        from public.diver_certifications c where c.diver_id = dp.user_id), '[]'::jsonb)
      else '[]'::jsonb end
  ) into v_card
  from public.diver_profiles dp
  join public.users u on u.id = dp.user_id
  where dp.user_id = v_diver;

  return v_card;
end;
$$;


-- Full CV access for a company: it revealed the diver AND (active subscription OR the reveal came from a
-- one-time search whose entitlement is still valid). Used by lib/cv-access.ts.
create or replace function public.company_has_cv_access(p_diver uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return false;
  end if;
  if not exists (select 1 from public.users u where u.id = v_uid and u.role = 'company') then
    return false;
  end if;
  if public._company_has_active_subscription(v_uid) then
    return exists (select 1 from public.match_reveals r where r.company_id = v_uid and r.diver_id = p_diver);
  end if;
  return exists (
    select 1 from public.match_reveals r
    join public.search_entitlements e on e.search_id = r.search_id and e.company_id = r.company_id
    where r.company_id = v_uid and r.diver_id = p_diver
      and e.refunded_at is null and e.expires_at > now()
  );
end;
$$;

revoke all on function public._assert_active_company() from public, anon, authenticated;
revoke all on function public._assert_company_user() from public, anon, authenticated;
revoke all on function public._company_has_active_subscription(uuid) from public, anon, authenticated;
revoke all on function public._company_has_open_entitlement(uuid) from public, anon, authenticated;
revoke all on function public.search_divers(jsonb) from public, anon;
revoke all on function public.reveal_match(uuid, int) from public, anon;
revoke all on function public.company_billing_status() from public, anon;
revoke all on function public.company_has_cv_access(uuid) from public, anon;
grant execute on function public.search_divers(jsonb) to authenticated;
grant execute on function public.reveal_match(uuid, int) to authenticated;
grant execute on function public.company_billing_status() to authenticated;
grant execute on function public.company_has_cv_access(uuid) to authenticated;

-- Admin activity overview: same columns as 018, plus billing columns appended at the end.
create or replace view public.admin_company_activity with (security_invoker = true) as
select c.user_id, c.company_name, c.plan, c.subscription_status,
  (select count(*) from public.company_searches s
     where s.company_id = c.user_id and s.created_at > now() - interval '30 days') as searches_30d,
  (select count(*) from public.match_reveals r
     where r.company_id = c.user_id and r.created_at > now() - interval '30 days') as reveals_30d,
  (select count(*) from public.match_reveals r
     where r.company_id = c.user_id and r.created_at > now() - interval '1 day') as reveals_24h,
  (select max(r.created_at) from public.match_reveals r where r.company_id = c.user_id) as last_reveal,
  c.subscription_current_period_end,
  c.subscription_cancel_at_period_end,
  (select count(*) from public.search_entitlements e
     where e.company_id = c.user_id and e.used_at is null and e.refunded_at is null and e.expires_at > now()) as open_one_time_searches,
  (select count(*) from public.search_entitlements e
     where e.company_id = c.user_id and e.purchased_at > now() - interval '30 days') as one_time_purchases_30d
from public.companies c;

revoke all on public.admin_company_activity from anon;
grant select on public.admin_company_activity to authenticated;
