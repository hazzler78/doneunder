-- RPCs for company Search & Match. Called from Next.js server actions with the
-- user's session (NOT the service role) so auth.uid() is the company.

create or replace function public._assert_active_company()
returns uuid
language plpgsql
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
    where u.id = v_uid
      and u.role = 'company'
      and lower(coalesce(trim(c.subscription_status), 'inactive')) = 'active'
  ) then
    raise exception 'company_subscription_required' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create or replace function public._hours_band(p_hours int)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_hours, 0) <= 0 then 'not declared'
    when p_hours < 250 then '<250'
    when p_hours < 500 then '250-500'
    when p_hours < 1000 then '500-1000'
    when p_hours < 2000 then '1000-2000'
    when p_hours < 5000 then '2000-5000'
    else '5000+'
  end;
$$;

/*
  p_criteria keys (all optional):
    certs          text[]  required certificate names (substring, case-insensitive), must be valid until needed_until
    needed_until   date    defaults to current_date
    location       text    substring match on diver location
    min_dive_hours int
    min_sat_hours  int
    welding        text[]  any overlap with welding_tickets
    available_only boolean default true
    verified_only  boolean default false
*/
create or replace function public.search_divers(p_criteria jsonb)
returns table (search_id uuid, slot int, teaser jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public._assert_active_company();
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

  insert into public.company_searches (company_id, criteria, result_diver_ids, result_count)
  values (v_company, v_criteria, v_ids, cardinality(v_ids))
  returning id into v_search;

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
  v_company uuid := public._assert_active_company();
  v_search public.company_searches%rowtype;
  v_diver uuid;
  v_card jsonb;
begin
  select * into v_search from public.company_searches s where s.id = p_search_id for update;
  if not found or v_search.company_id <> v_company then
    raise exception 'search_not_found' using errcode = 'P0002';
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

revoke all on function public._assert_active_company() from public, anon, authenticated;
revoke all on function public.search_divers(jsonb) from public, anon;
revoke all on function public.reveal_match(uuid, int) from public, anon;
grant execute on function public.search_divers(jsonb) to authenticated;
grant execute on function public.reveal_match(uuid, int) to authenticated;

-- Admin activity overview (security_invoker: admin RLS policies apply).
create or replace view public.admin_company_activity with (security_invoker = true) as
select c.user_id, c.company_name, c.plan, c.subscription_status,
  (select count(*) from public.company_searches s
     where s.company_id = c.user_id and s.created_at > now() - interval '30 days') as searches_30d,
  (select count(*) from public.match_reveals r
     where r.company_id = c.user_id and r.created_at > now() - interval '30 days') as reveals_30d,
  (select count(*) from public.match_reveals r
     where r.company_id = c.user_id and r.created_at > now() - interval '1 day') as reveals_24h,
  (select max(r.created_at) from public.match_reveals r where r.company_id = c.user_id) as last_reveal
from public.companies c;

revoke all on public.admin_company_activity from anon;
grant select on public.admin_company_activity to authenticated;
