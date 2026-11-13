-- Trim surplus seed demo users and add a dedicated Hermes test diver.
-- Safe on production: only touches @demo.doneunder.ai seed rows and hello+demo throwaways.

delete from public.users
where
  email = 'hello+demo@doneunder.ai'
  or email in (
    'elin@demo.doneunder.ai',
    'omar@demo.doneunder.ai',
    'johan@demo.doneunder.ai',
    'ricardo@demo.doneunder.ai',
    'martin@demo.doneunder.ai',
    'sami@demo.doneunder.ai',
    'isak@demo.doneunder.ai',
    'bluespan@demo.doneunder.ai',
    'baltic@demo.doneunder.ai'
  )
  or id in (
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555',
    '66666666-6666-6666-6666-666666666666',
    '77777777-7777-7777-7777-777777777777',
    '88888888-8888-8888-8888-888888888888',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  );

delete from auth.users
where email = 'hello+demo@doneunder.ai';

insert into public.users (id, role, email, username, full_name)
values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'diver', 'hermes@demo.doneunder.ai', 'hermes-demo', 'Hermes Test Diver')
on conflict (id) do update set
  role = excluded.role,
  email = excluded.email,
  username = excluded.username,
  full_name = excluded.full_name;

insert into public.diver_profiles (
  user_id,
  headline,
  bio,
  availability_status,
  location,
  mobilization_notice,
  profile_status,
  verified
)
values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Hermes bot test diver | cert date review',
  'Synthetic profile for Hermes and Grok bot smoke tests on doneunder.ai.',
  'available',
  'Malmo, Sweden',
  'Test only',
  'draft',
  false
)
on conflict (user_id) do update set
  headline = excluded.headline,
  bio = excluded.bio,
  profile_status = 'draft',
  updated_at = now();

delete from public.diver_certifications where diver_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

insert into public.diver_certifications (diver_id, name, issue_date, expiry_date, sort_order, source, expiry_confirmed)
values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'HSE Part 2', '2020-01-01', '2030-12-31', 0, 'manual', true),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'OPITO BOSIET with HUET and CA-EBS', '2024-06-01', '2028-06-01', 1, 'manual', true),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Offshore Diver Medical', '2025-01-15', '2026-01-15', 2, 'manual', true);
