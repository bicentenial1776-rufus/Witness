-- Family sharing reaches the tree's photos. Every other tree-scoped table
-- got a member read policy in 20260830120000_family_sharing; media and
-- media_links were added after that and missed it, so a companion opening
-- a shared Portrait saw no photos. Writes and deletes stay owner-only.

create policy "Members read shared media" on media
  for select using (tree_id in (select member_tree_ids()));

create policy "Members read shared media links" on media_links
  for select using (tree_id in (select member_tree_ids()));

-- Objects live at {owner_uid}/{tree_id}/{media_id}.{ext}; the tree id
-- in the second folder is what gates a companion, not the whole owner
-- folder — an owner may hold trees the companion was never invited to.
-- The trees subquery resolves through the member policy on trees, so a
-- revoked seat closes the folder in the same breath (the grave-photos
-- pattern from 20260831120000_family_sharing_phase3).
create policy "tree media read shared" on storage.objects
  for select using (
    bucket_id = 'tree-media'
    and (storage.foldername(name))[2] in (
      select t.id::text
      from trees t
      where t.id in (select member_tree_ids())
    )
  );
