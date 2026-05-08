do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'public read diver ambassador identity'
  ) then
    create policy "public read diver ambassador identity" on public.users
      for select
      using (role = 'diver');
  end if;
end
$$;

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
  d.ambassador_key_highlights
from public.users u
join public.diver_profiles d on d.user_id = u.id
where u.role = 'diver';

grant select on public.public_diver_ambassador to anon, authenticated;
