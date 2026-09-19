-- Cost & pipeline audit, 2026-09-19 (docs/COST_AUDIT_2026-09-19.md).
--
-- Findings this migration acts on, measured on production with
-- pg_stat_statements (cumulative since 2026-07-01) and EXPLAIN (ANALYZE):
--
--   1. The geocode worker runs every minute and its "what is pending"
--      read was the single most expensive statement in the database:
--      83,141 calls, 5.4 hours of execution, 15,541 buffers per call --
--      a sequential scan of all 128,880 places to find, almost always,
--      zero rows with geocoded_at null. A partial index turns that into
--      a two-buffer lookup.
--   2. The same worker's "did another tree already resolve this string"
--      read (places.raw = any(...) and latitude is not null) had no
--      usable index: 7,706 calls at 932 ms each (2 hours). A btree on raw
--      restricted to geocoded rows serves it, and reuse_geocodes' distinct
--      on (raw) scan at the end of every import.
--   3. Index build-up. The 2026-09-15 disk-IO fix added (tree_id), the
--      2026-09-15 incident fix added (tree_id, id), and the 2026-09-17
--      covering indexes added (tree_id, id) INCLUDE (...) -- on the same
--      four tables. A covering index answers every query the two narrower
--      ones can, so the narrower ones are ~120 MB of pure write
--      amplification on the import path. Same for relationships_tree_idx
--      (leading column of three other indexes) and two indexes no query
--      shape in the codebase can use (places (latitude, longitude);
--      individual_events (event_type, date_year) -- every event_type
--      filter also carries tree_id or individual_id).
--   4. Supabase advisors: two FSV policies call auth.uid() per row
--      (auth_rls_initplan); three user_id foreign keys added this week have
--      no index (they exist for account-deletion cascades); two trigger
--      functions have a mutable search_path; and every SECURITY DEFINER
--      function is executable by anon through PUBLIC's default grant.
--      get_invite and get_share are used anonymously on purpose (the join
--      and shared pages); the other ten are not.
--
-- Index statements are CONCURRENTLY, so this file cannot run inside a
-- transaction. Applied to production statement by statement through the
-- management API on 2026-09-19, then recorded with
-- `supabase migration repair --status applied 20260919200000`.

-- ── 1 + 2: the geocode worker ───────────────────────────────────────────
create index concurrently if not exists places_pending_geocode_idx
  on public.places (tree_id, id)
  where geocoded_at is null;

create index concurrently if not exists places_raw_geocoded_idx
  on public.places (raw)
  include (latitude, longitude)
  where latitude is not null;

-- ── 3: redundant indexes ────────────────────────────────────────────────
drop index concurrently if exists public.individual_events_tree_id_idx;      -- 7.5 MB
drop index concurrently if exists public.individual_events_tree_id_id_idx;   -- 49 MB
drop index concurrently if exists public.individuals_tree_id_idx;            -- 3.3 MB
drop index concurrently if exists public.individuals_tree_id_id_idx;         -- 12 MB
drop index concurrently if exists public.places_tree_id_idx;                 -- 4.6 MB
drop index concurrently if exists public.places_tree_id_id_idx;              -- 11 MB
drop index concurrently if exists public.families_tree_id_idx;               -- 1.3 MB
drop index concurrently if exists public.families_tree_id_id_idx;            -- 4.9 MB
drop index concurrently if exists public.relationships_tree_idx;             -- 1.3 MB
drop index concurrently if exists public.places_lat_lng_idx;                 -- 17 MB, 18 scans since July
drop index concurrently if exists public.individual_events_type_year_idx;    -- 7.3 MB, no matching query shape

-- ── 4: advisor findings ─────────────────────────────────────────────────
alter policy "fsv_early_access: a user may see their own row" on public.fsv_early_access
  using ((select auth.uid()) = user_id);
alter policy "fsv_room_log: a user may write their own rows" on public.fsv_room_log
  with check ((select auth.uid()) = user_id);

create index concurrently if not exists fsv_room_log_user_id_idx on public.fsv_room_log (user_id);
create index concurrently if not exists orphan_records_user_id_idx on public.orphan_records (user_id);
create index concurrently if not exists tree_health_findings_user_id_idx on public.tree_health_findings (user_id);

alter function public.relationships_default_tier() set search_path = public;
alter function public.family_children_fill_tree_id() set search_path = public;

-- Anonymous callers keep exactly the two token-lookup functions the join
-- and shared pages call before sign-in. PUBLIC is revoked too: it is where
-- anon's grant came from. The trigger and the cron-only cleanup are not
-- callable by any API role.
revoke execute on function public.carry_tree_sharing(uuid, uuid) from public, anon;
revoke execute on function public.delete_tree_batch(uuid, boolean) from public, anon;
revoke execute on function public.get_waiting_seat() from public, anon;
revoke execute on function public.is_tree_owner(uuid) from public, anon;
revoke execute on function public.member_tree_ids() from public, anon;
revoke execute on function public.recount_tree(uuid) from public, anon;
revoke execute on function public.reuse_geocodes(uuid) from public, anon;
revoke execute on function public.search_people(uuid, text, integer, integer) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.cleanup_stale_failed_tree_imports(interval) from public, anon, authenticated;
revoke execute on function public.get_invite(text) from public;
revoke execute on function public.get_share(text) from public;
