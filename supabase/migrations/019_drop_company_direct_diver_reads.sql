-- APPLY ONLY AFTER the search & match app code (and 017/018) is deployed.
-- Closes the leak where any active-subscription company could `select *` every
-- published diver profile, certification, experience and reference (incl. reference
-- phone/email) straight from the browser with the anon key.
-- Owner and admin policies are kept. Companies get full-CV read access only for
-- divers they have revealed through reveal_match. References are never readable by companies.

drop policy if exists "active company reads published profiles" on public.diver_profiles;
drop policy if exists "active company reads published certifications" on public.diver_certifications;
drop policy if exists "active company reads published experiences" on public.diver_experiences;
drop policy if exists "active company reads published references" on public.diver_references;

drop policy if exists "company reads revealed profiles" on public.diver_profiles;
create policy "company reads revealed profiles" on public.diver_profiles
for select using (
  profile_status = 'published'
  and exists (select 1 from public.match_reveals r
              where r.company_id = auth.uid() and r.diver_id = diver_profiles.user_id)
);

drop policy if exists "company reads revealed certifications" on public.diver_certifications;
create policy "company reads revealed certifications" on public.diver_certifications
for select using (
  exists (select 1 from public.match_reveals r
          join public.diver_profiles dp on dp.user_id = r.diver_id and dp.profile_status = 'published'
          where r.company_id = auth.uid() and r.diver_id = diver_certifications.diver_id)
);

drop policy if exists "company reads revealed experiences" on public.diver_experiences;
create policy "company reads revealed experiences" on public.diver_experiences
for select using (
  exists (select 1 from public.match_reveals r
          join public.diver_profiles dp on dp.user_id = r.diver_id and dp.profile_status = 'published'
          where r.company_id = auth.uid() and r.diver_id = diver_experiences.diver_id)
);
