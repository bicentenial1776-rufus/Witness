-- Disk IO remediation, prompted by Supabase's Disk IO Budget warning on 2026-09-15.
--
-- Root cause (confirmed via the project's performance advisor + pg_policies):
--   1. 45 foreign key columns across the app's core tables had no covering
--      index, forcing full sequential scans on every join/filter by them.
--   2. RLS policies on the biggest tables called auth.uid() directly, so
--      Postgres re-evaluated it once per row scanned instead of once per query.
--   3. 7 of those tables carried two separate permissive SELECT policies
--      ("owner" + "shared with tree members"), so every SELECT paid for
--      both policies' row-by-row checks even though one subsumes the other.
--
-- None of these change what any user can see or do -- they only change how
-- much work Postgres does to answer the same questions.
--
-- Applied to the project on 2026-09-15 through the Supabase MCP tool; this
-- file was captured from supabase_migrations.schema_migrations afterwards so
-- the repo carries every migration the database has.

-- ============================================================================
-- 1. Covering indexes for unindexed foreign keys
--    (Supabase performance advisor: unindexed_foreign_keys)
-- ============================================================================

create index if not exists ancestor_notes_tree_id_idx on public.ancestor_notes (tree_id);
create index if not exists ancestor_visits_tree_id_idx on public.ancestor_visits (tree_id);
create index if not exists citations_user_id_idx on public.citations (user_id);
create index if not exists corrections_user_id_idx on public.corrections (user_id);
create index if not exists curiosities_family_id_idx on public.curiosities (family_id);
create index if not exists curiosities_user_id_idx on public.curiosities (user_id);
create index if not exists curiosity_individuals_user_id_idx on public.curiosity_individuals (user_id);
create index if not exists enrichment_cache_tree_id_idx on public.enrichment_cache (tree_id);
create index if not exists families_user_id_idx on public.families (user_id);
create index if not exists family_children_user_id_idx on public.family_children (user_id);
create index if not exists findings_user_id_idx on public.findings (user_id);
create index if not exists grave_captures_user_id_idx on public.grave_captures (user_id);
create index if not exists individual_events_tree_id_idx on public.individual_events (tree_id);
create index if not exists individual_events_user_id_idx on public.individual_events (user_id);
create index if not exists individuals_user_id_idx on public.individuals (user_id);
create index if not exists invites_accepted_by_idx on public.invites (accepted_by);
create index if not exists invites_tree_id_idx on public.invites (tree_id);
create index if not exists library_pins_query_id_idx on public.library_pins (query_id);
create index if not exists media_user_id_idx on public.media (user_id);
create index if not exists media_links_user_id_idx on public.media_links (user_id);
create index if not exists media_readings_user_id_idx on public.media_readings (user_id);
create index if not exists nara_candidates_na_id_idx on public.nara_candidates (na_id);
create index if not exists nara_candidates_user_id_idx on public.nara_candidates (user_id);
create index if not exists nara_enrichment_state_tree_id_idx on public.nara_enrichment_state (tree_id);
create index if not exists nara_enrichment_state_user_id_idx on public.nara_enrichment_state (user_id);
create index if not exists passenger_candidates_user_id_idx on public.passenger_candidates (user_id);
create index if not exists person_register_links_record_id_idx on public.person_register_links (record_id);
create index if not exists person_register_links_register_key_idx on public.person_register_links (register_key);
create index if not exists person_register_links_user_id_idx on public.person_register_links (user_id);
create index if not exists places_user_id_idx on public.places (user_id);
create index if not exists register_enrichment_state_individual_id_idx on public.register_enrichment_state (individual_id);
create index if not exists register_enrichment_state_user_id_idx on public.register_enrichment_state (user_id);
create index if not exists relationships_home_person_id_idx on public.relationships (home_person_id);
create index if not exists relationships_user_id_idx on public.relationships (user_id);
create index if not exists research_briefs_individual_id_idx on public.research_briefs (individual_id);
create index if not exists research_briefs_tree_id_idx on public.research_briefs (tree_id);
create index if not exists share_links_individual_id_idx on public.share_links (individual_id);
create index if not exists share_links_tree_id_idx on public.share_links (tree_id);
create index if not exists sources_user_id_idx on public.sources (user_id);
create index if not exists story_arcs_home_person_id_idx on public.story_arcs (home_person_id);
create index if not exists tree_health_marks_user_id_idx on public.tree_health_marks (user_id);
create index if not exists tree_members_home_person_id_idx on public.tree_members (home_person_id);
create index if not exists tree_members_invited_by_idx on public.tree_members (invited_by);
create index if not exists trees_home_person_id_idx on public.trees (home_person_id);
create index if not exists trees_user_id_idx on public.trees (user_id);

-- ============================================================================
-- 2. Stop re-evaluating auth.uid() per row
--    (Supabase performance advisor: auth_rls_initplan)
--
--    Wrapping auth.uid() as `(select auth.uid())` lets Postgres evaluate it
--    once per query and treat it as a constant, instead of once per row
--    scanned. Only the 3 tables NOT touched by section 3 below need this --
--    the other 7 get the same fix as part of their policy rewrite there.
-- ============================================================================

alter policy "Users manage their own relationships" on public.relationships
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users read their own enrichment state" on public.nara_enrichment_state
  using ((select auth.uid()) = user_id);

alter policy "Users read their own register enrichment state" on public.register_enrichment_state
  using ((select auth.uid()) = user_id);

-- ============================================================================
-- 3. Consolidate duplicate permissive SELECT policies
--    (Supabase performance advisor: multiple_permissive_policies)
--
--    citations, families, family_children, individual_events, individuals,
--    media_links, and places each had two permissive SELECT policies --
--    "owner" and "shared with tree members" -- that Postgres had to
--    evaluate and OR together on every read. Each pair is replaced with a
--    single SELECT policy carrying both conditions (identical visibility,
--    one evaluation instead of two), plus separate INSERT/UPDATE/DELETE
--    policies carrying exactly the write rules the old combined "ALL"
--    owner policy enforced. Access rules are unchanged; only the number of
--    policies Postgres evaluates per query goes down.
-- ============================================================================

-- citations
drop policy "Members read shared citations" on public.citations;
drop policy "Users manage their own citations" on public.citations;

create policy "Users select their own or shared citations" on public.citations
  for select
  using (
    (select auth.uid()) = user_id
    or tree_id in (select member_tree_ids())
  );

create policy "Users insert their own citations" on public.citations
  for insert
  with check ((select auth.uid()) = user_id);

create policy "Users update their own citations" on public.citations
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own citations" on public.citations
  for delete
  using ((select auth.uid()) = user_id);

-- families
drop policy "Members read shared families" on public.families;
drop policy "Users manage their own families" on public.families;

create policy "Users select their own or shared families" on public.families
  for select
  using (
    (select auth.uid()) = user_id
    or tree_id in (select member_tree_ids())
  );

create policy "Users insert their own families" on public.families
  for insert
  with check ((select auth.uid()) = user_id and is_tree_owner(tree_id));

create policy "Users update their own families" on public.families
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and is_tree_owner(tree_id));

create policy "Users delete their own families" on public.families
  for delete
  using ((select auth.uid()) = user_id);

-- family_children
drop policy "Members read shared family children" on public.family_children;
drop policy "Users manage their own family children" on public.family_children;

create policy "Users select their own or shared family children" on public.family_children
  for select
  using (
    (select auth.uid()) = user_id
    or family_id in (
      select families.id from families
      where families.tree_id in (select member_tree_ids())
    )
  );

create policy "Users insert their own family children" on public.family_children
  for insert
  with check ((select auth.uid()) = user_id);

create policy "Users update their own family children" on public.family_children
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own family children" on public.family_children
  for delete
  using ((select auth.uid()) = user_id);

-- individual_events
drop policy "Members read shared events" on public.individual_events;
drop policy "Users manage their own individual events" on public.individual_events;

create policy "Users select their own or shared individual events" on public.individual_events
  for select
  using (
    (select auth.uid()) = user_id
    or tree_id in (select member_tree_ids())
  );

create policy "Users insert their own individual events" on public.individual_events
  for insert
  with check ((select auth.uid()) = user_id and is_tree_owner(tree_id));

create policy "Users update their own individual events" on public.individual_events
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and is_tree_owner(tree_id));

create policy "Users delete their own individual events" on public.individual_events
  for delete
  using ((select auth.uid()) = user_id);

-- individuals
drop policy "Members read shared individuals" on public.individuals;
drop policy "Users manage their own individuals" on public.individuals;

create policy "Users select their own or shared individuals" on public.individuals
  for select
  using (
    (select auth.uid()) = user_id
    or tree_id in (select member_tree_ids())
  );

create policy "Users insert their own individuals" on public.individuals
  for insert
  with check ((select auth.uid()) = user_id and is_tree_owner(tree_id));

create policy "Users update their own individuals" on public.individuals
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and is_tree_owner(tree_id));

create policy "Users delete their own individuals" on public.individuals
  for delete
  using ((select auth.uid()) = user_id);

-- media_links
drop policy "Members read shared media links" on public.media_links;
drop policy "Users manage their own media links" on public.media_links;

create policy "Users select their own or shared media links" on public.media_links
  for select
  using (
    (select auth.uid()) = user_id
    or tree_id in (select member_tree_ids())
  );

create policy "Users insert their own media links" on public.media_links
  for insert
  with check ((select auth.uid()) = user_id and is_tree_owner(tree_id));

create policy "Users update their own media links" on public.media_links
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and is_tree_owner(tree_id));

create policy "Users delete their own media links" on public.media_links
  for delete
  using ((select auth.uid()) = user_id);

-- places
drop policy "Members read shared places" on public.places;
drop policy "Users manage their own places" on public.places;

create policy "Users select their own or shared places" on public.places
  for select
  using (
    (select auth.uid()) = user_id
    or tree_id in (select member_tree_ids())
  );

create policy "Users insert their own places" on public.places
  for insert
  with check ((select auth.uid()) = user_id and is_tree_owner(tree_id));

create policy "Users update their own places" on public.places
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and is_tree_owner(tree_id));

create policy "Users delete their own places" on public.places
  for delete
  using ((select auth.uid()) = user_id);
