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
as $$
  with pattern as (
    -- The query is data, not pattern: escape ilike's metacharacters.
    select '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' as p
  ),
  name_hits as (
    select i.id, i.full_name, i.birth_year, i.death_year, i.living, null::text as place
    from individuals i, pattern
    where i.tree_id = p_tree_id
      and i.full_name ilike pattern.p
  ),
  matching_places as (
    -- The tree's own places first (trigram index), then their events.
    select pl.id, pl.raw
    from places pl, pattern
    where pl.tree_id = p_tree_id
      and pl.raw ilike pattern.p
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
