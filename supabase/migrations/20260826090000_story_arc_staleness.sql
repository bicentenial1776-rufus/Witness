-- A staleness signal for story arcs.
--
-- Arcs were cached per founder forever: one row, keyed on
-- (founder_id, prompt_version), with nothing recorded about the record it
-- was told from. tree_syntheses has carried individual_count since it was
-- written — drift against trees.individual_count is what makes the essay
-- morph with the record — but arcs had no equivalent, so a line told once
-- was told that way for good. The Gates line stopped at Adna Thomas Howe
-- three generations short of the reader, and nothing could ever take it
-- back.
--
-- Three columns, all of them free to check: the function already holds the
-- tree row and the direct-ancestor set by the time it reads the cache.
--   home_person_id   — who "you" is. Change it and every arc is wrong:
--                      the relation labels, the closing generation, the
--                      descent itself.
--   individual_count — the tree grew or shrank (recount_tree keeps this
--                      honest; the app calls it when listing trees).
--   ancestor_count   — the direct-ancestor set changed shape without the
--                      person count moving, which is exactly what a
--                      relationship recompute does when the rules change.
--
-- Nullable on purpose: rows written before this migration carry no signal,
-- and the freshness test requires all three to match, so they read as stale
-- and are retold on first sight. No backfill can invent what they were told
-- from.
alter table story_arcs
  add column home_person_id uuid references individuals (id) on delete cascade,
  add column individual_count integer,
  add column ancestor_count integer;

comment on column story_arcs.home_person_id is
  'Home person at generation time; drift against trees.home_person_id is stale.';
comment on column story_arcs.individual_count is
  'Tree size at generation time; drift against trees.individual_count is stale.';
comment on column story_arcs.ancestor_count is
  'Direct-ancestor rows at generation time; drift means the line may have moved.';
