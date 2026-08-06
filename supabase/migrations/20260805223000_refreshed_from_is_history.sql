-- trees.refreshed_from was declared as a foreign key to trees(id) with
-- ON DELETE SET NULL. That is self-defeating: a refresh deletes the old tree
-- as its last step, so the constraint nulled the column the instant it was
-- set. Verified against a scratch tree — the value never survived the call
-- that wrote it.
--
-- What the column is actually for is history: a note of which tree this one
-- replaced, readable in support long after that tree is gone. A dangling id
-- is precisely the desired state, so the reference has no business being
-- enforced. Dropping the constraint and keeping the column and its data.

alter table trees drop constraint if exists trees_refreshed_from_fkey;

comment on column trees.refreshed_from is
  'Id of the tree this one replaced in a GEDCOM Refresh. Intentionally not a foreign key — the referenced tree is deleted by the same operation, so this is history, not a relationship.';
