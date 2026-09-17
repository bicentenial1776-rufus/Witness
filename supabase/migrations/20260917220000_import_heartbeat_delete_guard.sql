-- Delete guard for in-flight imports.
--
-- 2026-09-17: a 61,773-person import was running in one browser tab; from
-- You in a second tab the tree looked like an unfinished import and was
-- deleted mid-flight, and the importer then failed against a tree that no
-- longer existed. Nothing distinguished "importing right now" from "died
-- yesterday": the importer never touched the tree row between its first
-- insert and its final counts update.
--
-- The importer now stamps trees.import_heartbeat_at every ~20 s while rows
-- are landing. delete_tree_batch refuses a tree still marked 'importing'
-- whose last activity (heartbeat, else imported_at) is under ten minutes
-- old, unless p_force — account deletion passes it. A tree whose import
-- really died stays deletable after ten quiet minutes. The final tree-row
-- delete is logged to usage_events as tree_deleted so a deletion can be
-- reconstructed afterwards (none of Rich's could be).

alter table public.trees add column if not exists import_heartbeat_at timestamptz;

-- The one-argument signature must go, or PostgREST sees two candidates for
-- a call that passes only p_tree_id.
drop function if exists public.delete_tree_batch(uuid);

create or replace function public.delete_tree_batch(p_tree_id uuid, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  t record;
begin
  select id, name, individual_count, import_status,
         coalesce(import_heartbeat_at, imported_at) as last_activity
    into t
    from trees
   where id = p_tree_id and user_id = auth.uid();
  if not found then
    -- Already gone (a prior call deleted the tree row) or never theirs;
    -- either way there is nothing left for this caller to delete.
    return jsonb_build_object('done', true, 'deleted', 0, 'stage', 'none');
  end if;

  if not p_force
     and t.import_status = 'importing'
     and t.last_activity > now() - interval '10 minutes' then
    return jsonb_build_object(
      'done', false, 'deleted', 0, 'stage', 'importing',
      'refused', true, 'last_activity', t.last_activity
    );
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
  -- Logged first: the row's own facts are gone a statement later.
  insert into usage_events (user_id, event_name, properties, source)
  values (
    auth.uid(), 'tree_deleted',
    jsonb_build_object(
      'tree_id', p_tree_id, 'name', t.name, 'individual_count', t.individual_count,
      'import_status', t.import_status, 'forced', p_force
    ),
    'client'
  );
  delete from trees where id = p_tree_id;
  return jsonb_build_object('done', true, 'deleted', 1, 'stage', 'tree');
end;
$$;
