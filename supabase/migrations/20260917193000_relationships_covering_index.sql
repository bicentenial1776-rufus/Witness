-- fetchRelationshipRows (packages/core/src/family/queries.ts) now pages by
-- keyset on individual_id and sorts nearest-generations-first in the app.
-- This index answers each page without touching the heap; the old OFFSET
-- loop read and sorted all 12,421 of a 61,773-person tree's rows on every
-- one of its 13 pages (17 s, 2026-09-17).
--
-- Applied to production by hand with CREATE INDEX CONCURRENTLY + VACUUM
-- (ANALYZE), recorded with
-- `supabase migration repair --status applied 20260917193000`.
create index if not exists relationships_tree_id_individual_id_covering_idx
  on public.relationships (tree_id, individual_id)
  include (label, tier, qualifier, generation_distance, line, is_direct_ancestor, is_direct_descendant, user_id);
