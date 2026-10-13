-- Lock down full living CV data.
-- Public teaser stays on public_diver_ambassador (no polished CV markdown).
-- Experiences / certifications / references are no longer world-readable.
-- diver_profiles is no longer world-readable (was select using true).

-- 1) Ambassador view: drop full CV markdown from public surface
drop view if exists public.public_diver_ambassador;

create view public.public_diver_ambassador as
select
  u.id as user_id,
  u.username,
  u.full_name,
  d.headline,
  d.bio,
  d.sat_hours,
  d.dive_hours,
  d.location,
  d.mobilization_notice,
  d.availability_status,
  d.ambassador_public_headline,
  d.ambassador_short_bio,
  d.ambassador_key_highlights,
  d.profile_status,
  d.published_at,
  u.avatar_url
from public.users u
join public.diver_profiles d on d.user_id = u.id
where u.role = 'diver'
  and d.profile_status = 'published';

grant select on public.public_diver_ambassador to anon, authenticated;
alter view public.public_diver_ambassador set (security_invoker = false);

-- 2) Teaser tickets only (name + expiry) for published divers
create or replace view public.public_diver_cert_teaser as
select
  c.diver_id,
  c.name,
  c.expiry_date,
  c.sort_order
from public.diver_certifications c
join public.diver_profiles dp on dp.user_id = c.diver_id
where dp.profile_status = 'published';

grant select on public.public_diver_cert_teaser to anon, authenticated;
alter view public.public_diver_cert_teaser set (security_invoker = false);

-- 3) Drop world-readable CV section policies
drop policy if exists "public read published diver experiences" on public.diver_experiences;
drop policy if exists "public read published diver certifications" on public.diver_certifications;
drop policy if exists "public read published diver references" on public.diver_references;

-- 4) diver_profiles: replace open public read
drop policy if exists "diver profile public read" on public.diver_profiles;

drop policy if exists "diver reads own profile" on public.diver_profiles;
create policy "diver reads own profile" on public.diver_profiles
for select using (auth.uid() = user_id);

drop policy if exists "admin reads diver profiles" on public.diver_profiles;
create policy "admin reads diver profiles" on public.diver_profiles
for select using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  )
);

drop policy if exists "active company reads published profiles" on public.diver_profiles;
create policy "active company reads published profiles" on public.diver_profiles
for select using (
  profile_status = 'published'
  and exists (
    select 1
    from public.users u
    join public.companies c on c.user_id = u.id
    where u.id = auth.uid()
      and u.role = 'company'
      and lower(coalesce(c.subscription_status, 'inactive')) = 'active'
  )
);

-- 5) Full CV sections: owner + admin + active company
drop policy if exists "admin reads all experiences" on public.diver_experiences;
create policy "admin reads all experiences" on public.diver_experiences
for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "active company reads published experiences" on public.diver_experiences;
create policy "active company reads published experiences" on public.diver_experiences
for select using (
  exists (
    select 1
    from public.diver_profiles dp
    join public.users u on u.id = auth.uid()
    join public.companies c on c.user_id = u.id
    where dp.user_id = diver_experiences.diver_id
      and dp.profile_status = 'published'
      and u.role = 'company'
      and lower(coalesce(c.subscription_status, 'inactive')) = 'active'
  )
);

drop policy if exists "admin reads all certifications" on public.diver_certifications;
create policy "admin reads all certifications" on public.diver_certifications
for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "active company reads published certifications" on public.diver_certifications;
create policy "active company reads published certifications" on public.diver_certifications
for select using (
  exists (
    select 1
    from public.diver_profiles dp
    join public.users u on u.id = auth.uid()
    join public.companies c on c.user_id = u.id
    where dp.user_id = diver_certifications.diver_id
      and dp.profile_status = 'published'
      and u.role = 'company'
      and lower(coalesce(c.subscription_status, 'inactive')) = 'active'
  )
);

drop policy if exists "admin reads all references" on public.diver_references;
create policy "admin reads all references" on public.diver_references
for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "active company reads published references" on public.diver_references;
create policy "active company reads published references" on public.diver_references
for select using (
  exists (
    select 1
    from public.diver_profiles dp
    join public.users u on u.id = auth.uid()
    join public.companies c on c.user_id = u.id
    where dp.user_id = diver_references.diver_id
      and dp.profile_status = 'published'
      and u.role = 'company'
      and lower(coalesce(c.subscription_status, 'inactive')) = 'active'
  )
);

comment on view public.public_diver_ambassador is
  'Public teaser card only. Full CV markdown removed; paywalled sections live behind RLS.';

comment on view public.public_diver_cert_teaser is
  'Public ticket names + expiry for ambassador teasers. No cert numbers.';
