-- Family sharing phase 3 (design brief §6 + Rufus 2026-08-30): the
-- confirmed stone reaches the companion's Portrait. A capture that has
-- been ATTACHED — owner-confirmed onto a person — is a confirmed fact,
-- which is exactly the tier companions were granted; the working pipeline
-- (queued/reading/read/lead/dismissed) stays the owner's alone.

create policy "Members read attached stones" on grave_captures
  for select using (
    status = 'attached'
    and tree_id in (select member_tree_ids())
  );

-- The photos behind those captures live in the grave-photos bucket keyed
-- {owner_uid}/…, folder-per-user rather than per-capture — so membership
-- opens the folder of any owner whose tree the caller sits on. That is
-- family seeing the family's stone photos; write and delete stay
-- owner-only. The trees subquery resolves through the member policy on
-- trees, so a revoked seat closes the folder in the same breath.
create policy "grave photos read shared" on storage.objects
  for select using (
    bucket_id = 'grave-photos'
    and (storage.foldername(name))[1] in (
      select t.user_id::text
      from trees t
      where t.id in (select member_tree_ids())
    )
  );
