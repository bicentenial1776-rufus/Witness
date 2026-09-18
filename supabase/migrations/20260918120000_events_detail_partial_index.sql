-- The rooms' census words (Family Street View, PR #27): the parser now keeps
-- a residence or census event's note and source titles on
-- individual_events.detail. The tree index reads those in a second, targeted
-- page (packages/core/src/query/treeIndex.ts) so the main events page stays
-- an index-only scan. This partial index serves that second read: only the
-- rows that carry detail, keyed the way the page walks them, with the text
-- included so the read never touches the heap.
--
-- Applied on production 2026-09-18 with CREATE INDEX CONCURRENTLY, then
-- `supabase migration repair --status applied 20260918120000`.

create index if not exists individual_events_detail_idx
  on public.individual_events (tree_id, id)
  include (detail, user_id)
  where detail is not null and event_type in ('residence', 'census');
