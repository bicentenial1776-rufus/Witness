-- Explore's people search, paged and counted server-side (2026-08-18):
-- the client's two-query merge capped name matches at the 20 earliest-born,
-- so common given names silently hid people (Henry Irving Haskell vanished
-- from a "Henry" search). One query owns the union now — name matches and
-- place matches, deduped by person, newest birth year first — with the
-- window's total riding on every row so the client can page honestly.
--
-- Security invoker on purpose: RLS on individuals / individual_events /
-- places already scopes rows to the caller; p_tree_id narrows to one tree
-- (RLS is per-user, not per-tree).

create or replace function search_people(
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
  place_hits as (
    -- One row per person with any event at a matching place, tagged with
    -- the place that surfaced them; name matches keep precedence (no tag).
    select distinct on (i.id)
      i.id, i.full_name, i.birth_year, i.death_year, i.living, pl.raw as place
    from individual_events e
    join individuals i on i.id = e.individual_id
    join places pl on pl.id = e.place_id
    cross join pattern
    where e.tree_id = p_tree_id
      and pl.raw ilike pattern.p
      and not exists (select 1 from name_hits n where n.id = i.id)
    order by i.id, pl.raw
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
