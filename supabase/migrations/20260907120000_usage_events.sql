-- Usage monitoring: first-party operational logging only — no third-party
-- analytics or ad trackers, nothing sold or shared (docs/privacy.html is
-- updated alongside this migration to say so honestly). Motivated by
-- Betsey's 2026-09-07 beta call (docs/beta-feedback-betsey-2026-09-07.md)
-- and the "Tree Pulse on iPhone/iPad" / cost-visibility items in
-- docs/IDEAS.md.
--
-- Two feeds, deliberately kept separate:
--
-- 1. `usage_events` — client-side moments that have no existing home:
--    logins, feature taps, GEDCOM import attempts (with file size). A
--    generic table because these are heterogeneous and will grow one
--    event_name at a time as specific screens get instrumented.
--
-- 2. Two column additions that close a real gap instead of opening a
--    second bookkeeping system: enrichment_cache, story_arcs, and
--    tree_syntheses already record model + token counts per AI call.
--    research_briefs recorded `model` but not tokens; grave_captures
--    (headstone reads, "At the Stone") recorded neither. `ai_usage_daily`
--    below reads all five as one ledger.

create table usage_events (
  id uuid primary key default gen_random_uuid(),
  -- Null is reserved for a future pre-auth moment; nothing logs one yet.
  user_id uuid references auth.users (id) on delete cascade,
  event_name text not null,
  properties jsonb not null default '{}',
  source text not null check (source in ('client', 'edge_function', 'cron')),
  created_at timestamptz not null default now()
);

create index usage_events_user_created_idx on usage_events (user_id, created_at);
create index usage_events_name_created_idx on usage_events (event_name, created_at);

alter table usage_events enable row level security;

-- A signed-in device may log its own moments. There is no select policy —
-- this table is written, never read, through the app; querying it is an
-- operator task (Supabase Studio / service role), the same posture as an
-- access log rather than a feature.
create policy "insert own usage events" on usage_events
  for insert with check (auth.uid() = user_id);

alter table research_briefs add column input_tokens integer;
alter table research_briefs add column output_tokens integer;

alter table grave_captures add column model text;
alter table grave_captures add column input_tokens integer;
alter table grave_captures add column output_tokens integer;

-- security_invoker: the view enforces each underlying table's own RLS for
-- whoever queries it, rather than running with the view owner's rights —
-- the current five sources are all "read your own rows" tables, so this
-- keeps that true through the view instead of accidentally becoming a
-- cross-user leak the day someone grants a client role access to it.
create view ai_usage_daily
  with (security_invoker = true)
  as
  select user_id, 'biography_or_context'::text as kind, model, input_tokens, output_tokens, created_at
    from enrichment_cache
  union all
  select user_id, 'research_brief', model, input_tokens, output_tokens, created_at
    from research_briefs
  union all
  select user_id, 'story_arc', model, input_tokens, output_tokens, created_at
    from story_arcs
  union all
  select user_id, 'tree_synthesis', model, input_tokens, output_tokens, created_at
    from tree_syntheses
  union all
  select user_id, 'headstone_reading', model, input_tokens, output_tokens, created_at
    from grave_captures
    where model is not null;
