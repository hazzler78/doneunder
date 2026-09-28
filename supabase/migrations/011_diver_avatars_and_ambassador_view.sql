-- Public headshots for ambassador business cards.
insert into storage.buckets (id, name, public)
values ('diver-avatars', 'diver-avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "divers upload own avatar" on storage.objects;
create policy "divers upload own avatar"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'diver-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "divers update own avatar" on storage.objects;
create policy "divers update own avatar"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'diver-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'diver-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "divers delete own avatar" on storage.objects;
create policy "divers delete own avatar"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'diver-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "public read diver avatars" on storage.objects;
create policy "public read diver avatars"
on storage.objects
for select
to public
using (bucket_id = 'diver-avatars');

-- CREATE OR REPLACE cannot insert a column mid-list (headline would shift to avatar_url).
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
  d.polished_cv_markdown,
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
