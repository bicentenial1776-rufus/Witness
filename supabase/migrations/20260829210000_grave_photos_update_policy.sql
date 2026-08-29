-- A stone's upload retries with upsert:true, but upserting OVER an object
-- that a half-finished flush already created needs an UPDATE policy — and
-- the bucket only had insert/select/delete. A stone whose first photos
-- landed before the signal died was therefore poisoned forever: every
-- retry failed "new row violates row-level security policy" at photo 0
-- (found 2026-08-29, the one cemetery stone that would not drain).
create policy "grave photos update own" on storage.objects
  for update
  using (bucket_id = 'grave-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'grave-photos' and (storage.foldername(name))[1] = auth.uid()::text);
