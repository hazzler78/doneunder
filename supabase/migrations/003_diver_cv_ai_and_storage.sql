alter table public.diver_profiles
  add column if not exists polished_cv_markdown text,
  add column if not exists polished_cv_json jsonb,
  add column if not exists ambassador_public_headline text,
  add column if not exists ambassador_short_bio text,
  add column if not exists ambassador_key_highlights text[] default '{}',
  add column if not exists cv_last_processed_at timestamptz;

insert into storage.buckets (id, name, public)
values ('diver-documents', 'diver-documents', false)
on conflict (id) do nothing;

drop policy if exists "divers upload own documents" on storage.objects;
create policy "divers upload own documents"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'diver-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "divers read own documents" on storage.objects;
create policy "divers read own documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'diver-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "divers delete own documents" on storage.objects;
create policy "divers delete own documents"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'diver-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
