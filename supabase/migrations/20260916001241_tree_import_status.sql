-- A partial import used to be indistinguishable from a finished one. The
-- tree row goes in first (every other row points at it), the client then
-- writes rows table by table, and a client that dies part-way — statement
-- timeout, lost network, closed tab — leaves a tree that recount_tree soon
-- dresses up with real-looking counts. Rich Douglass's 61,773-person PAF
-- export (2026-09-15) stopped twice, and the second attempt's remains —
-- people and events but no parent-child links — became his active tree,
-- because largest individual_count wins.
--
-- Every tree now says whether its import finished. The client writes
-- 'importing' with the tree row and 'complete' with the final counts, and
-- marks 'failed' when it catches the stop. Anything not 'complete' is a
-- partial import: never the active-tree fallback, never a refresh target,
-- shown under You as unfinished with only a delete on offer.
alter table trees add column import_status text not null default 'complete'
  check (import_status in ('importing', 'complete', 'failed'));

-- The default is 'complete' so every tree that exists today, and every tree
-- an app build from before this column imports, reads as finished. Except
-- these: import.tsx refuses a file with no people, so a tree with none is an
-- import that never got as far as writing them.
update trees set import_status = 'failed' where individual_count = 0;
