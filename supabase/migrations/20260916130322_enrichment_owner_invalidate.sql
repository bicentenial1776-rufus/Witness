-- A confirmed crossing changes the facts a biography and its historical
-- context were written from, but enrichment_cache is keyed by prompt
-- version, never by the facts — so a story written before the verdict
-- would stand forever. Writes stay service-role only; the tree's owner
-- may now delete a row so the next read regenerates (the read-media
-- worker already does the same with admin rights). Owner, not member:
-- members read shared enrichment, and only the owner rules on a record
-- (owner_only_tree_writes).
create policy "Owners invalidate their tree's enrichments" on enrichment_cache
  for delete using (
    tree_id in (select id from trees where user_id = auth.uid())
  );
