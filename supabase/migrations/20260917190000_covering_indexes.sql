-- Covering indexes for the keyset page queries (paginate.ts / treeIndex.ts /
-- treeHealth.ts / orphanRecords.ts / family queries).
--
-- Why: pages are ordered by `id`, a random UUID, while rows sit on disk in
-- insertion order, so a plain (tree_id, id) index still fetched one heap page
-- per row — 10,078 buffer reads for a 10,000-row page, 2.3 s of CPU inside
-- Postgres on the Micro instance. With every column the pages select carried
-- in the index (plus user_id, which the RLS policy reads), the same page is an
-- Index Only Scan: 160 buffers, 0 heap fetches, 144 ms (individual_events,
-- measured as the owner with RLS applied, 2026-09-17).
--
-- family_children is deliberately absent: it has no tree_id and pages through
-- a join to families; it needs tree_id denormalised onto it first.
--
-- Applied to production by hand with CREATE INDEX CONCURRENTLY followed by
-- VACUUM (ANALYZE) on each table (the visibility map must be set for
-- index-only scans), and recorded with
-- `supabase migration repair --status applied 20260917190000`.
create index if not exists individual_events_tree_id_id_covering_idx
  on public.individual_events (tree_id, id)
  include (individual_id, event_type, date_year, date_month, date_day, date_qualifier, date_confidence, place_id, user_id);

create index if not exists individuals_tree_id_id_covering_idx
  on public.individuals (tree_id, id)
  include (gedcom_xref, ancestry_uid, full_name, given_name, surname, sex, birth_year, death_year, living, user_id);

create index if not exists places_tree_id_id_covering_idx
  on public.places (tree_id, id)
  include (raw, parts, latitude, longitude, user_id);

create index if not exists families_tree_id_id_covering_idx
  on public.families (tree_id, id)
  include (husband_id, wife_id, marriage_date_year, marriage_date_month, marriage_date_day, marriage_date_qualifier, marriage_place_id, user_id);
