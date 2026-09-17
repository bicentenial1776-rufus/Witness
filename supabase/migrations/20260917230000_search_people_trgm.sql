-- Search on a large tree (2026-09-17, Rich Douglass's 61,773 people):
-- search_people took 1.4–10 s, against Explore's 4 s stall fuse, so every
-- search on the big tree fell back to the on-device index — a minute's
-- fetch in a fresh browser. Two causes:
--
--   1. `full_name ilike '%q%'` and `places.raw ilike '%q%'` had no index
--      that helps a substring match: every name (and every place) in the
--      tree was compared in turn.
--   2. The place branch never filtered places by tree: it walked all
--      191k place rows in the database (RLS then discarded 142k of them)
--      before touching a single event.
--
-- pg_trgm GIN indexes make both ilike predicates index-backed, and the
-- place branch now starts from the tree's own places. The function body is
-- otherwise the 20260818150000 one.
--
-- Applied by hand on production 2026-09-17 with CREATE INDEX CONCURRENTLY
-- (which cannot run inside this migration's transaction), then
-- `supabase migration repair --status applied 20260917230000`.

create extension if not exists pg_trgm with schema extensions;

create index if not exists individuals_full_name_trgm_idx
  on public.individuals using gin (full_name extensions.gin_trgm_ops);
create index if not exists places_raw_trgm_idx
  on public.places using gin (raw extensions.gin_trgm_ops);

create or replace function public.search_people(
  p_tree_id uuid,
  p_query text,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  full_name text,
  birth_year integer,
  death_year integer,
  living boolean,
  place text,
  total bigint
)
language sql
stable
-- SECURITY DEFINER, with the access check written out below: under row-
-- level security `ilike` (not leakproof) may not be used as an index
-- condition, so as the authenticated role the trigram indexes were never
-- chosen and every name in the tree was compared. Running as the owner
-- lets the indexes apply; `allowed` reproduces the individuals policy
-- (owner, or member of a shared tree) for the one tree searched.
security definer
set search_path = public, extensions
as $$
  with allowed as (
    select 1
    from trees t
    where t.id = p_tree_id
      and (t.user_id = auth.uid() or t.id in (select member_tree_ids()))
  ),
  pattern as (
    -- The query is data, not pattern: escape ilike's metacharacters.
    select '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' as p
  ),
  -- The pattern is read as a scalar subquery, not joined: joined, the
  -- planner treats `ilike` as a join filter and compares every row in the
  -- tree; as an init-plan parameter it can drive the trigram indexes.
  name_hits as (
    select i.id, i.full_name, i.birth_year, i.death_year, i.living, null::text as place
    from individuals i
    where exists (select 1 from allowed)
      and i.tree_id = p_tree_id
      and i.full_name ilike (select p from pattern)
  ),
  matching_places as (
    -- The tree's own places first (trigram index), then their events.
    select pl.id, pl.raw
    from places pl
    where exists (select 1 from allowed)
      and pl.tree_id = p_tree_id
      and pl.raw ilike (select p from pattern)
  ),
  place_hits as (
    -- One row per person with any event at a matching place, tagged with
    -- the place that surfaced them; name matches keep precedence (no tag).
    select distinct on (i.id)
      i.id, i.full_name, i.birth_year, i.death_year, i.living, mp.raw as place
    from matching_places mp
    join individual_events e on e.place_id = mp.id and e.tree_id = p_tree_id
    join individuals i on i.id = e.individual_id
    where not exists (select 1 from name_hits n where n.id = i.id)
    order by i.id, mp.raw
  ),
  hits as (
    select * from name_hits
    union all
    select * from place_hits
  )
  select hits.*, count(*) over () as total
  from hits
  order by hits.birth_year desc nulls last, hits.full_name asc
  limit p_limit offset p_offset;
$$;
