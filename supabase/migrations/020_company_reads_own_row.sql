-- Let a logged-in company read its own row (needed by lib/cv-access.ts after 019).
create policy "company reads own row" on public.companies
  for select to authenticated
  using (user_id = auth.uid());
