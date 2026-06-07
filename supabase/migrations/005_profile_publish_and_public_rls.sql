alter table public.diver_profiles
  add column if not exists profile_status text not null default 'draft'
    check (profile_status in ('draft', 'published')),
  add column if not exists published_at timestamptz;

-- Existing seeded/live profiles with content become published so ambassador pages keep working.
update public.diver_profiles
set
  profile_status = 'published',
  published_at = coalesce(published_at, now())
where coalesce(trim(headline), '') <> '';

create or replace view public.public_diver_ambassador as
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
  d.polished_cv_markdown,
  d.ambassador_public_headline,
  d.ambassador_short_bio,
  d.ambassador_key_highlights,
  d.profile_status,
  d.published_at
from public.users u
join public.diver_profiles d on d.user_id = u.id
where u.role = 'diver'
  and d.profile_status = 'published';

grant select on public.public_diver_ambassador to anon, authenticated;

drop policy if exists "public read published diver experiences" on public.diver_experiences;
create policy "public read published diver experiences" on public.diver_experiences
for select using (
  exists (
    select 1
    from public.diver_profiles dp
    where dp.user_id = diver_experiences.diver_id
      and dp.profile_status = 'published'
  )
);

drop policy if exists "public read published diver certifications" on public.diver_certifications;
create policy "public read published diver certifications" on public.diver_certifications
for select using (
  exists (
    select 1
    from public.diver_profiles dp
    where dp.user_id = diver_certifications.diver_id
      and dp.profile_status = 'published'
  )
);

drop policy if exists "public read published diver references" on public.diver_references;
create policy "public read published diver references" on public.diver_references
for select using (
  exists (
    select 1
    from public.diver_profiles dp
    where dp.user_id = diver_references.diver_id
      and dp.profile_status = 'published'
  )
);
