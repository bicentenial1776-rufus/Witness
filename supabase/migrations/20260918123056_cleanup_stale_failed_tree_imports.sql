-- Prompted by capacity planning: checking whether current data volume was
-- inflated by waste before recommending a compute upgrade. It mostly wasn't
-- (place dedup is already correct, citation text is tiny) -- except for one
-- real gap: failed GEDCOM imports leave every row they'd already written
-- (places, in the cases found) sitting in the database forever, because
-- nothing ever cleans up a tree once import_status flips to 'failed'. Found
-- 3 failed trees carrying 58,000 orphaned place rows between them (~74 MB),
-- plus 2 old complete trees left behind by non-idempotent re-imports
-- (~21 MB) -- both cleaned up directly via the Supabase MCP tool before this
-- migration, using the same stage order as delete_tree_batch.
--
-- This function automates the failed-import half of that going forward (the
-- superseded-but-complete-tree case is NOT auto-cleaned -- a user might
-- deliberately keep more than one complete tree, so that stays a manual,
-- user-initiated delete). It mirrors delete_tree_batch's proven batch sizes
-- (individuals 400, families 500, places 200 per slice) so a large failed
-- import can't blow the statement timeout here either, and logs each
-- deletion to usage_events the same way manual deletes are logged.
--
-- Scheduled daily rather than tied to import failure itself, so a failed
-- tree stays visible in the app's "unfinished imports" list (You tab) for a
-- few days before being swept -- it's dead data either way (imports are not
-- retried in place), but the grace period keeps it inspectable if a user or
-- support conversation needs to see what failed.

create or replace function public.cleanup_stale_failed_tree_imports(p_older_than interval default interval '3 days')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tree record;
  v_trees_deleted integer := 0;
  v_rows_deleted integer := 0;
  n integer;
begin
  for v_tree in
    select id, user_id, name, individual_count, import_status,
           coalesce(import_heartbeat_at, imported_at) as last_activity
    from trees
    where import_status = 'failed'
      and coalesce(import_heartbeat_at, imported_at) < now() - p_older_than
  loop
    -- Same stage order and batch sizes as delete_tree_batch: individuals
    -- carry the heavy cascades, families hold marriage_place_id (clear
    -- before places so the FK on-delete-set-null trigger has nothing left
    -- to touch), places last, then the tree row cascades anything left.
    loop
      delete from individuals where id in (
        select id from individuals where tree_id = v_tree.id limit 400
      );
      get diagnostics n = row_count;
      v_rows_deleted := v_rows_deleted + n;
      exit when n = 0;
    end loop;

    loop
      delete from families where id in (
        select id from families where tree_id = v_tree.id limit 500
      );
      get diagnostics n = row_count;
      v_rows_deleted := v_rows_deleted + n;
      exit when n = 0;
    end loop;

    loop
      delete from places where id in (
        select id from places where tree_id = v_tree.id limit 200
      );
      get diagnostics n = row_count;
      v_rows_deleted := v_rows_deleted + n;
      exit when n = 0;
    end loop;

    insert into usage_events (user_id, event_name, properties, source)
    values (
      v_tree.user_id, 'tree_deleted',
      jsonb_build_object(
        'tree_id', v_tree.id, 'name', v_tree.name, 'individual_count', v_tree.individual_count,
        'import_status', v_tree.import_status, 'forced', true, 'cleanup_source', 'auto_failed_import'
      ),
      'cron'
    );
    delete from trees where id = v_tree.id;
    v_trees_deleted := v_trees_deleted + 1;
  end loop;

  return jsonb_build_object('trees_deleted', v_trees_deleted, 'rows_deleted', v_rows_deleted);
end;
$$;

select cron.schedule(
  'cleanup-failed-tree-imports',
  '0 9 * * *',
  $job$select cleanup_stale_failed_tree_imports();$job$
);
