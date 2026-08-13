-- The demo seed user occupied public username `gareth`, so the real Gareth
-- account (gareth@doneunder.ai) was stored as diver-3220ff10. Give him `gareth`.

update public.users
set username = 'gareth-demo'
where id = '11111111-1111-1111-1111-111111111111'
  and username = 'gareth';

update public.users
set username = 'gareth'
where email = 'gareth@doneunder.ai'
  and username is distinct from 'gareth';

-- Public /gareth and /cv/gareth only resolve published ambassador rows.
update public.diver_profiles
set
  profile_status = 'published',
  published_at = coalesce(published_at, now()),
  updated_at = now()
where user_id in (
  select id from public.users where email = 'gareth@doneunder.ai'
)
  and profile_status = 'draft';
