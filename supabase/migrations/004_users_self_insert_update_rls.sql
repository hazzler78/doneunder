-- Signup calls upsert on public.users from the authenticated session.
-- 001_init only granted SELECT on own row, so INSERT/UPDATE were blocked.

create policy "users can insert own profile" on public.users
for insert
with check (auth.uid() = id);

create policy "users can update own profile" on public.users
for update
using (auth.uid() = id)
with check (auth.uid() = id);
