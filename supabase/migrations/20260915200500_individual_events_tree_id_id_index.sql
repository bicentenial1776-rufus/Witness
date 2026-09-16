-- Fixes Library questions returning nothing on the web app (report
-- 2026-09-15): the tree-index fetch that every Library query depends on
-- (packages/core/src/query/treeIndex.ts) pages through individual_events
-- with `order by id` + `range()`, filtered by tree_id under RLS.
--
-- The plain individual_events_tree_id_idx added in
-- 20260915153753_fix_disk_io_indexes_and_rls.sql wasn't enough: for that
-- access pattern the planner kept preferring an Index Scan on the primary
-- key (to satisfy `order by id` without a separate sort) and filtering
-- tree_id row by row, rather than using the tree_id index. For a
-- moderately large tree that meant scanning tens of thousands of
-- non-matching rows to fill one page, which blew past the statement
-- timeout (confirmed via EXPLAIN ANALYZE and postgrest_logs: repeated
-- "canceling statement due to statement timeout" / 500s on this exact
-- query). Once fetchTreeIndex's Promise.all rejected, the Library results
-- screen never got matches back -- it just hung.
--
-- A composite (tree_id, id) index lets a single Index Scan satisfy both
-- the tree_id filter and the id ordering directly, without touching any
-- other tree's rows. Verified: the same query dropped from ~10.5s
-- (timing out) to ~0.2s after this index existed.

create index concurrently if not exists individual_events_tree_id_id_idx
  on public.individual_events (tree_id, id);
