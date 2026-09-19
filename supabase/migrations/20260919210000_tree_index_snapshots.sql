-- Tree index snapshots (docs/COST_AUDIT_2026-09-19.md, open item 1).
--
-- Every whole-tree screen (Tree, Explore, Generations, FSV rooms, the
-- Library, ...) pages five tables through PostgREST to build the tree
-- index: ~25 requests and 63 MB of JSON on the 61,773-person tree, with
-- Postgres spending dedicated-core CPU on json_agg for each page — the
-- reason the Large compute tier was needed on 2026-09-18, and the largest
-- egress line the app has. The index is a pure function of import-time
-- rows, so it is now written ONCE per import as one object in Storage:
--
--   tree-index/<tree_id>/<imported_at epoch ms>.json
--
-- The client reads that object (one request, CDN-served) instead of paging
-- the tables, and falls back to the page fetch when the object is not
-- there yet. Two writers: the importer itself at the end of an upload (it
-- holds every row it just wrote), and packages/core/scripts/build-tree-
-- index.mts from the ops-watch tick for trees imported by other means or
-- before this migration.
--
-- Stamp: trees.index_snapshot_at is set when the object is written; the
-- client trusts the object only when that stamp is at or after imported_at,
-- exactly as the on-device field copy already does with imported_at.

alter table public.trees
  add column if not exists index_snapshot_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tree-index', 'tree-index', false, 524288000, array['application/json'])
on conflict (id) do nothing;

-- Owners write and read their own trees' snapshots; members of a shared
-- tree read them. The first folder is the tree id. The trees subquery runs
-- under the trees policies, so a revoked seat closes the folder with it.
drop policy if exists "tree index owner all" on storage.objects;
create policy "tree index owner all" on storage.objects
  for all
  using (
    bucket_id = 'tree-index'
    and (storage.foldername(name))[1] in (
      select t.id::text from public.trees t where t.user_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'tree-index'
    and (storage.foldername(name))[1] in (
      select t.id::text from public.trees t where t.user_id = (select auth.uid())
    )
  );

drop policy if exists "tree index member read" on storage.objects;
create policy "tree index member read" on storage.objects
  for select using (
    bucket_id = 'tree-index'
    and (storage.foldername(name))[1] in (
      select t.id::text from public.trees t where t.id in (select member_tree_ids())
    )
  );
