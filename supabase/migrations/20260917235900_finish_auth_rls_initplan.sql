-- Finish the auth_rls_initplan cleanup that 20260915153753_fix_disk_io_indexes_and_rls.sql
-- started: 51 policies (37 in public, 14 in gtm) still called auth.uid() /
-- auth.role() directly, so Postgres re-evaluated them once per row scanned
-- instead of once per query.
--
-- Prompted by investigating a real sign-in failure (504 gateway timeout on
-- auth/v1/token): the database was logging "canceling statement due to
-- statement timeout" under load, and Supabase's performance advisor still
-- listed these 51 policies. Wrapping the auth call as `(select auth.uid())`
-- turns it into a one-time initplan instead of a per-row re-evaluation, which
-- is exactly what the earlier migration did for the first batch. This does
-- not change who can see or do what -- only how much work Postgres does to
-- answer the same questions.

-- ============================================================================
-- public schema
-- ============================================================================

alter policy "Users manage their own ancestor notes" on public.ancestor_notes
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users manage their own visits" on public.ancestor_visits
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users manage their own corrections" on public.corrections
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users manage their own curiosities" on public.curiosities
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users manage their own curiosity individuals" on public.curiosity_individuals
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users read their own enrichments" on public.enrichment_cache
  using ((select auth.uid()) = user_id);

alter policy "Owners invalidate their tree's enrichments" on public.enrichment_cache
  using (tree_id in (
    select trees.id from trees where trees.user_id = (select auth.uid())
  ));

alter policy "Users manage their own findings" on public.findings
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "own captures" on public.grave_captures
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "Users manage their own grave confirmations" on public.grave_confirmations
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Owners manage their own invites" on public.invites
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and is_tree_owner(tree_id));

alter policy "Users manage their own pins" on public.library_pins
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users manage their own media" on public.media
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and is_tree_owner(tree_id));

alter policy "Owners manage their media readings" on public.media_readings
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and is_tree_owner(tree_id));

alter policy "Users read their own candidates" on public.nara_candidates
  using ((select auth.uid()) = user_id);

alter policy "Users resolve their own candidates" on public.nara_candidates
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Catalog documents are readable by all signed-in users" on public.nara_documents
  using ((select auth.role()) = 'authenticated');

alter policy "own passenger candidates" on public.passenger_candidates
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and is_tree_owner(tree_id));

alter policy "own register links" on public.person_register_links
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and is_tree_owner(tree_id));

alter policy "Users manage their own profile" on public.profiles
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

alter policy "Catalog is readable by all signed-in users" on public.query_catalog
  using ((select auth.role()) = 'authenticated');

alter policy "register record events are readable" on public.register_record_events
  using ((select auth.role()) = 'authenticated');

alter policy "register records are readable" on public.register_records
  using ((select auth.role()) = 'authenticated');

alter policy "registers are readable" on public.registers
  using ((select auth.role()) = 'authenticated');

alter policy "Users delete their own briefs" on public.research_briefs
  using ((select auth.uid()) = user_id);

alter policy "Users read their own briefs" on public.research_briefs
  using ((select auth.uid()) = user_id);

alter policy "Users update their own briefs" on public.research_briefs
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users manage their own share links" on public.share_links
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users manage their own sources" on public.sources
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users read their own story arcs" on public.story_arcs
  using ((select auth.uid()) = user_id);

alter policy "Users manage their own tree health marks" on public.tree_health_marks
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users manage their own tree health rulings" on public.tree_health_rulings
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Members and owners read memberships" on public.tree_members
  using ((select auth.uid()) = user_id or is_tree_owner(tree_id));

alter policy "Members update their own seat" on public.tree_members
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      home_person_id is null
      or home_person_id in (
        select individuals.id from individuals
        where individuals.tree_id = tree_members.tree_id
      )
    )
  );

alter policy "Users read their own tree synthesis" on public.tree_syntheses
  using ((select auth.uid()) = user_id);

alter policy "Users manage their own trees" on public.trees
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "insert own usage events" on public.usage_events
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- gtm schema (internal GTM/analytics dashboard, not reader-facing, but still
-- queried by the same database and worth the same one-line fix)
-- ============================================================================

alter policy "dashboard users read pulse" on gtm.app_pulse_daily
  using (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ));

alter policy "allowlisted users have full access" on gtm.app_store_funnel_weekly
  using (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ))
  with check (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ));

alter policy "allowlisted users have full access" on gtm.asc_metrics_daily
  using (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ))
  with check (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ));

alter policy "allowlisted users have full access" on gtm.daily_insights
  using (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ))
  with check (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ));

alter policy "users can see their own allowlist row" on gtm.dashboard_users
  using (id = (select auth.uid()));

alter policy "allowlisted users have full access" on gtm.email_templates
  using (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ))
  with check (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ));

alter policy "owner only" on gtm.gmail_connections
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "allowlisted users have full access" on gtm.outreach_campaigns
  using (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ))
  with check (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ));

alter policy "allowlisted users have full access" on gtm.outreach_notes
  using (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ))
  with check (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ));

alter policy "allowlisted users have full access" on gtm.revenuecat_metrics_daily
  using (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ))
  with check (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ));

alter policy "dashboard users read overview" on gtm.revenuecat_overview_daily
  using (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ));

alter policy "allowlisted users have full access" on gtm.web_funnel_weekly
  using (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ))
  with check (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ));

alter policy "allowlisted users have full access" on gtm.web_traffic_daily
  using (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ))
  with check (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ));

alter policy "allowlisted users have full access" on gtm.ynab_costs
  using (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ))
  with check (exists (
    select 1 from gtm.dashboard_users du where du.id = (select auth.uid())
  ));
