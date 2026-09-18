-- Prompted by checking why a real user's "on this day" digest query
-- (packages/core/src/query/digest.ts) took 28.6 seconds after a beta tester
-- imported a 61,773-individual / 158,302-event tree and opened the Home tab
-- for the first time.
--
-- The digest query filters individual_events by tree_id + event_type +
-- (date_month, date_day) in a 7-day window. Only tree_id was indexed, so
-- Postgres pulled every one of the tree's events and discarded almost all of
-- them row by row (confirmed via EXPLAIN ANALYZE: "Rows Removed by Filter:
-- 72,020" out of ~158K events scanned). This index lets Postgres jump
-- straight to the handful of matching rows instead.
--
-- CONCURRENTLY avoids locking individual_events (442K+ rows across all
-- trees) while the index builds; applied directly via the Supabase MCP tool
-- since CREATE INDEX CONCURRENTLY cannot run inside a migration transaction.
-- This file documents it for the repo, matching the pattern established by
-- 20260915153753_fix_disk_io_indexes_and_rls.sql.

create index concurrently if not exists individual_events_tree_type_month_day_idx
  on individual_events (tree_id, event_type, date_month, date_day)
  include (individual_id, date_year, place_id, date_confidence);
