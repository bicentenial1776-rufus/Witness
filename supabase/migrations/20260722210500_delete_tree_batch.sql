-- Staged tree deletion. A whole-tree cascade delete (5,000+ individuals with
-- events, citations, and links) exceeds the API role's statement timeout, so
-- the app's single `delete from trees` always failed on real trees. Each call
-- here deletes one bounded slice quickly; the app loops until done=true.
-- (set local statement_timeout can't extend the *current* statement, which is
-- why batching, not a longer timeout, is the fix.)
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
    return jsonb_build_object('done', true, 'deleted', 0);
  end if;

  -- Individuals carry the heavy cascades (events, citations, family links,
  -- curiosity links, enrichment) — drain them first in small slices.
  delete from individuals where id in (
    select id from individuals where tree_id = p_tree_id limit 400
  );
  get diagnostics n = row_count;
  if n > 0 then
    return jsonb_build_object('done', false, 'deleted', n);
  end if;

  -- Remaining tables are light; one slice each, largest first.
  delete from places where id in (
    select id from places where tree_id = p_tree_id limit 2000
  );
  get diagnostics n = row_count;
  if n > 0 then
    return jsonb_build_object('done', false, 'deleted', n);
  end if;

  -- Everything else cascades from the tree row itself in one cheap delete.
  delete from trees where id = p_tree_id;
  return jsonb_build_object('done', true, 'deleted', 1);
end;
$$;
