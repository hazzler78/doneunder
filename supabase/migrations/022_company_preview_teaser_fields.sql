-- Enrich Search & Match teasers with initials + industry (visible pre-payment).
-- Full name / contact remain locked until unlock / active subscription.
-- Also documents the product rule: one-time purchase unlocks one search only.

alter table public.company_searches
  add column if not exists unlocked boolean not null default false;

comment on column public.company_searches.unlocked is
  'True after one-time unlock for this search, or when created under an active monthly subscription.';

create or replace function public._diver_initials(p_full_name text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(trim(p_full_name), '') = '' then '??'
    when array_length(regexp_split_to_array(trim(p_full_name), '\s+'), 1) = 1
      then upper(left(trim(p_full_name), 2))
    else upper(
      left((regexp_split_to_array(trim(p_full_name), '\s+'))[1], 1)
      || left((regexp_split_to_array(trim(p_full_name), '\s+'))[array_length(regexp_split_to_array(trim(p_full_name), '\s+'), 1)], 1)
    )
  end;
$$;

create or replace function public._diver_industry(p_headline text, p_certs text[])
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_headline, '') ~* 'wind|monopile' then 'Offshore wind'
    when coalesce(p_headline, '') ~* 'ndt|inspection|integrity' then 'Inspection / NDT'
    when coalesce(p_headline, '') ~* 'weld|hyperbaric|cswip' then 'Welding / repair'
    when coalesce(p_headline, '') ~* 'sat|saturation' then 'Saturation diving'
    when coalesce(p_headline, '') ~* 'inshore|harbour|construction' then 'Inshore construction'
    when coalesce(p_headline, '') ~* 'offshore|irm|pipeline|oil|gas' then 'Offshore oil & gas'
    when exists (
      select 1 from unnest(coalesce(p_certs, '{}')) c where c ~* 'ndt|pcn'
    ) then 'Inspection / NDT'
    when exists (
      select 1 from unnest(coalesce(p_certs, '{}')) c where c ~* 'cswip|weld'
    ) then 'Welding / repair'
    else 'Commercial diving'
  end;
$$;

-- Patch search_divers teaser payload to include initials + industry.
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
        'initials', public._diver_initials(u.full_name),
        'industry', public._diver_industry(
          coalesce(dp.headline, ''),
          coalesce((
            select array_agg(c.name) from public.diver_certifications c where c.diver_id = dp.user_id
          ), '{}')
        ),
        'certs_valid', coalesce(cert.valid_count, 0),
        'dive_hours_band', public._hours_band(dp.dive_hours),
        'sat_hours_band', public._hours_band(dp.sat_hours),
        'available', lower(coalesce(dp.availability_status, '')) = 'available',
        'verified', coalesce(dp.verified, false),
        'medical_valid', dp.medical_expiry is not null and dp.medical_expiry >= v_until,
        'welding', coalesce(array_length(dp.welding_tickets, 1), 0) > 0
      ) as teaser
    from public.diver_profiles dp
    join public.users u on u.id = dp.user_id
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

  insert into public.company_searches (company_id, criteria, result_diver_ids, result_count, unlocked)
  values (v_company, v_criteria, v_ids, cardinality(v_ids), true)
  returning id into v_search;

  insert into public.company_search_matches (search_id, company_id, diver_id, slot, score)
  select v_search, v_company, t.diver_id, t.slot, t.score from _sd_matches t;

  return query select v_search, t.slot, t.teaser from _sd_matches t order by t.slot;
end;
$$;
