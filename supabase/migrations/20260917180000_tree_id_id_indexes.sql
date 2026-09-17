-- Keyset pagination (paginate.ts: where tree_id = $1 and id > $last order by id
-- limit N) had a composite (tree_id, id) index only on individual_events. On
-- individuals, places and families the planner walked the primary key in id
-- order and filtered by tree, examining ~4,000 rows per 1,000-row page; under
-- the five parallel chains a tree-index fetch runs, pages on a 61,773-person
-- tree took 4-13 s and tripped the authenticated role's 8 s statement timeout
-- (Rich Douglass, 2026-09-17 — Tree Health, Generations and Orphan Records all
-- failed with "canceling statement due to statement timeout").
--
-- Applied to production by hand with CREATE INDEX CONCURRENTLY (which cannot
-- run inside this migration's transaction) and recorded with
-- `supabase migration repair --status applied 20260917180000`.
create index if not exists individuals_tree_id_id_idx on public.individuals (tree_id, id);
create index if not exists places_tree_id_id_idx on public.places (tree_id, id);
create index if not exists families_tree_id_id_idx on public.families (tree_id, id);
