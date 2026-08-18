-- Provider provenance (2026-08-18). Which program/platform wrote the
-- imported GEDCOM (normalized from HEAD.SOUR at parse time), and each
-- person's FamilySearch id (_FSFTID) where the exporter carried one —
-- RootsMagic and other FamilySearch-synced software do, which means a
-- desktop export can still deep-link its people to familysearch.org.
-- The person screen's external link is dynamic on these: Ancestry via
-- trees.ancestry_tree_id + xref (as before), FamilySearch via
-- individuals.familysearch_id, nothing otherwise — a reader without an
-- Ancestry account never sees an Ancestry button.

alter table trees add column provider text;
alter table individuals add column familysearch_id text;

-- Backfill from evidence already stored: an Ancestry tree id only ever
-- comes from an Ancestry export. Other providers stay null until their
-- trees are re-imported or refreshed (the parser stamps provider from the
-- header, which we did not retain server-side for existing trees).
update trees set provider = 'ancestry' where ancestry_tree_id is not null;
