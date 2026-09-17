-- The geography index's coordinates read (fetchGeographyExtras: id,
-- latitude, longitude for a tree's located places) walked the heap for
-- every located place — 17 s a page on a 45,439-place tree, which backed
-- up the API pool on 2026-09-17 evening. A partial covering index makes it
-- an index-only scan (107 ms for a 10,000-row page).
--
-- Applied on production 2026-09-17 via a one-off pg_cron job running
-- CREATE INDEX CONCURRENTLY (the CLI's query endpoint cancels at ~2 min
-- and the management API gateway times out at ~100 s), then
-- `supabase migration repair --status applied 20260917233000`.

create index if not exists places_tree_id_coords_idx
  on public.places (tree_id, id)
  include (latitude, longitude, user_id)
  where latitude is not null;
