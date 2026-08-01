-- Tree deletion failed at the places step with 57014 (statement timeout), and
-- the cause was missing foreign-key indexes rather than slice size.
--
-- Postgres does not index foreign keys automatically. `places` is referenced by
-- individual_events.place_id, families.marriage_place_id and
-- nara_candidates.place_id, all `on delete set null` — so deleting one place
-- forces a sequential scan of all three tables to find the rows to null out.
-- (nara_candidates has nara_candidates_tree_place_idx, but its leading column
-- is tree_id, so it cannot serve a lookup by place_id alone.)
-- delete_tree_batch took 2,000 places per call, i.e. 2,000 x 3 table scans in a
-- single statement, which blew the timeout every time. The earlier batching
-- migration fixed exactly this problem for individuals and stopped short of
-- places, which is why individuals drained fine and the delete then died.
--
-- Observed 2026-08-01 on a 3,861-place tree: 150 places per statement took
-- ~1.3s WITHOUT these indexes; 2,000 never completed.

create index if not exists individual_events_place_id_idx on individual_events (place_id);
create index if not exists families_marriage_place_id_idx on families (marriage_place_id);
create index if not exists nara_candidates_place_id_idx on nara_candidates (place_id);

-- Slice sizes now sit well inside the timeout even on the unindexed path, and
-- families are drained BEFORE places: every family holds a marriage_place_id,
-- so clearing them first removes references the place delete would otherwise
-- have to null out one at a time.
--
-- `stage` is returned so a caller can show honest progress ("removing places")
-- instead of a spinner that cannot say what it is doing.
create or replace function delete_tree_batch(p_tree_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not exists (select 1 from trees where id = p_tree_id and user_id = auth.uid()) then
    -- Already gone (a prior call deleted the tree row) or never theirs;
    -- either way there is nothing left for this caller to delete.
    return jsonb_build_object('done', true, 'deleted', 0, 'stage', 'none');
  end if;

  -- Individuals carry the heavy cascades (events, citations, family links,
  -- curiosity links, enrichment) — drain them first in small slices.
  delete from individuals where id in (
    select id from individuals where tree_id = p_tree_id limit 400
  );
  get diagnostics n = row_count;
  if n > 0 then
    return jsonb_build_object('done', false, 'deleted', n, 'stage', 'people');
  end if;

  delete from families where id in (
    select id from families where tree_id = p_tree_id limit 500
  );
  get diagnostics n = row_count;
  if n > 0 then
    return jsonb_build_object('done', false, 'deleted', n, 'stage', 'families');
  end if;

  delete from places where id in (
    select id from places where tree_id = p_tree_id limit 200
  );
  get diagnostics n = row_count;
  if n > 0 then
    return jsonb_build_object('done', false, 'deleted', n, 'stage', 'places');
  end if;

  -- Everything else cascades from the tree row itself in one cheap delete.
  delete from trees where id = p_tree_id;
  return jsonb_build_object('done', true, 'deleted', 1, 'stage', 'tree');
end;
$$;

-- trees.individual_count and friends are written once at import and never
-- revisited, so a partially-completed delete left a tree advertising 5,495
-- people while holding 295 — a 95% discrepancy that hid real data loss, and
-- that also drives which tree the app treats as active (largest count wins).
-- This recomputes them from the rows that actually exist; the app calls it
-- when listing trees so the numbers cannot drift silently again.
create or replace function recount_tree(p_tree_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_individuals integer;
  n_families integer;
  n_places integer;
begin
  if not exists (select 1 from trees where id = p_tree_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', false);
  end if;

  select count(*) into n_individuals from individuals where tree_id = p_tree_id;
  select count(*) into n_families from families where tree_id = p_tree_id;
  select count(*) into n_places from places where tree_id = p_tree_id;

  update trees
     set individual_count = n_individuals,
         family_count = n_families,
         place_count = n_places
   where id = p_tree_id;

  return jsonb_build_object(
    'ok', true,
    'individuals', n_individuals,
    'families', n_families,
    'places', n_places
  );
end;
$$;
