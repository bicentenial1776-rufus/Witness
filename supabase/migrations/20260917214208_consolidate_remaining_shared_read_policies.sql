-- Finish the multiple_permissive_policies cleanup that
-- 20260915153753_fix_disk_io_indexes_and_rls.sql started: that migration
-- merged 7 tables' duplicate "owner" + "shared with tree" SELECT policies
-- into one, but 12 more tables carried the exact same pattern and were
-- missed. Supabase's performance advisor still listed all 12 (72 findings =
-- 12 tables x 6 database roles each is checked against).
--
-- Postgres must evaluate every permissive policy that applies to a query and
-- OR the results together, so two overlapping SELECT policies cost twice the
-- work of one for no extra access. Each pair below is replaced with a single
-- SELECT policy carrying both conditions -- identical visibility, one
-- evaluation instead of two. Where the old policy was an "ALL" policy, its
-- write behavior (INSERT/UPDATE/DELETE) is preserved unchanged as separate
-- policies, exactly as the 2026-09-15 migration did for its 7 tables.
--
-- Two tables (story_arcs, tree_syntheses) had no write policies at all --
-- writes go through a service role that bypasses RLS -- so only their
-- duplicate SELECT policies are touched.

-- enrichment_cache (no ALL policy; DELETE policy is untouched)
drop policy "Members read shared enrichment" on public.enrichment_cache;
drop policy "Users read their own enrichments" on public.enrichment_cache;

create policy "Users select their own or shared enrichments" on public.enrichment_cache
  for select
  using (
    (select auth.uid()) = user_id
    or tree_id in (select member_tree_ids())
  );

-- findings
drop policy "Members read shared findings" on public.findings;
drop policy "Users manage their own findings" on public.findings;

create policy "Users select their own or shared findings" on public.findings
  for select
  using (
    (select auth.uid()) = user_id
    or tree_id in (select member_tree_ids())
  );

create policy "Users insert their own findings" on public.findings
  for insert
  with check ((select auth.uid()) = user_id);

create policy "Users update their own findings" on public.findings
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own findings" on public.findings
  for delete
  using ((select auth.uid()) = user_id);

-- grave_captures (shared read is narrower: only status = 'attached' stones)
drop policy "Members read attached stones" on public.grave_captures;
drop policy "own captures" on public.grave_captures;

create policy "Users select their own or attached shared captures" on public.grave_captures
  for select
  using (
    user_id = (select auth.uid())
    or (status = 'attached' and tree_id in (select member_tree_ids()))
  );

create policy "Users insert their own captures" on public.grave_captures
  for insert
  with check (user_id = (select auth.uid()));

create policy "Users update their own captures" on public.grave_captures
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users delete their own captures" on public.grave_captures
  for delete
  using (user_id = (select auth.uid()));

-- grave_confirmations
drop policy "Members read shared grave confirmations" on public.grave_confirmations;
drop policy "Users manage their own grave confirmations" on public.grave_confirmations;

create policy "Users select their own or shared grave confirmations" on public.grave_confirmations
  for select
  using (
    (select auth.uid()) = user_id
    or tree_id in (select member_tree_ids())
  );

create policy "Users insert their own grave confirmations" on public.grave_confirmations
  for insert
  with check ((select auth.uid()) = user_id);

create policy "Users update their own grave confirmations" on public.grave_confirmations
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own grave confirmations" on public.grave_confirmations
  for delete
  using ((select auth.uid()) = user_id);

-- media
drop policy "Members read shared media" on public.media;
drop policy "Users manage their own media" on public.media;

create policy "Users select their own or shared media" on public.media
  for select
  using (
    (select auth.uid()) = user_id
    or tree_id in (select member_tree_ids())
  );

create policy "Users insert their own media" on public.media
  for insert
  with check ((select auth.uid()) = user_id and is_tree_owner(tree_id));

create policy "Users update their own media" on public.media
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and is_tree_owner(tree_id));

create policy "Users delete their own media" on public.media
  for delete
  using ((select auth.uid()) = user_id);

-- media_readings
drop policy "Members read shared media readings" on public.media_readings;
drop policy "Owners manage their media readings" on public.media_readings;

create policy "Users select their own or shared media readings" on public.media_readings
  for select
  using (
    (select auth.uid()) = user_id
    or tree_id in (select member_tree_ids())
  );

create policy "Users insert their own media readings" on public.media_readings
  for insert
  with check ((select auth.uid()) = user_id and is_tree_owner(tree_id));

create policy "Users update their own media readings" on public.media_readings
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and is_tree_owner(tree_id));

create policy "Users delete their own media readings" on public.media_readings
  for delete
  using ((select auth.uid()) = user_id);

-- passenger_candidates
drop policy "Members read shared passenger candidates" on public.passenger_candidates;
drop policy "own passenger candidates" on public.passenger_candidates;

create policy "Users select their own or shared passenger candidates" on public.passenger_candidates
  for select
  using (
    user_id = (select auth.uid())
    or tree_id in (select member_tree_ids())
  );

create policy "Users insert their own passenger candidates" on public.passenger_candidates
  for insert
  with check (user_id = (select auth.uid()) and is_tree_owner(tree_id));

create policy "Users update their own passenger candidates" on public.passenger_candidates
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and is_tree_owner(tree_id));

create policy "Users delete their own passenger candidates" on public.passenger_candidates
  for delete
  using (user_id = (select auth.uid()));

-- person_register_links
drop policy "Members read shared register links" on public.person_register_links;
drop policy "own register links" on public.person_register_links;

create policy "Users select their own or shared register links" on public.person_register_links
  for select
  using (
    user_id = (select auth.uid())
    or tree_id in (select member_tree_ids())
  );

create policy "Users insert their own register links" on public.person_register_links
  for insert
  with check (user_id = (select auth.uid()) and is_tree_owner(tree_id));

create policy "Users update their own register links" on public.person_register_links
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and is_tree_owner(tree_id));

create policy "Users delete their own register links" on public.person_register_links
  for delete
  using (user_id = (select auth.uid()));

-- sources
drop policy "Members read shared sources" on public.sources;
drop policy "Users manage their own sources" on public.sources;

create policy "Users select their own or shared sources" on public.sources
  for select
  using (
    (select auth.uid()) = user_id
    or tree_id in (select member_tree_ids())
  );

create policy "Users insert their own sources" on public.sources
  for insert
  with check ((select auth.uid()) = user_id);

create policy "Users update their own sources" on public.sources
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own sources" on public.sources
  for delete
  using ((select auth.uid()) = user_id);

-- story_arcs (no write policies -- writes go through a service role)
drop policy "Members read shared story arcs" on public.story_arcs;
drop policy "Users read their own story arcs" on public.story_arcs;

create policy "Users select their own or shared story arcs" on public.story_arcs
  for select
  using (
    (select auth.uid()) = user_id
    or tree_id in (select member_tree_ids())
  );

-- tree_syntheses (no write policies -- writes go through a service role)
drop policy "Members read shared tree syntheses" on public.tree_syntheses;
drop policy "Users read their own tree synthesis" on public.tree_syntheses;

create policy "Users select their own or shared tree syntheses" on public.tree_syntheses
  for select
  using (
    (select auth.uid()) = user_id
    or tree_id in (select member_tree_ids())
  );

-- trees (shared condition is on id, not tree_id -- this is the trees table itself)
drop policy "Members read shared trees" on public.trees;
drop policy "Users manage their own trees" on public.trees;

create policy "Users select their own or shared trees" on public.trees
  for select
  using (
    (select auth.uid()) = user_id
    or id in (select member_tree_ids())
  );

create policy "Users insert their own trees" on public.trees
  for insert
  with check ((select auth.uid()) = user_id);

create policy "Users update their own trees" on public.trees
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own trees" on public.trees
  for delete
  using ((select auth.uid()) = user_id);
