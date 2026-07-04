-- Ancestry proprietary extensions captured by the parser: unique person
-- ids for re-import diff matching, deep-link record ids, military events,
-- and child relationship qualifiers for the relationship calculator.

alter table individuals
  add column ancestry_uid text,
  add column ancestry_apid text;

create index individuals_ancestry_uid_idx on individuals (tree_id, ancestry_uid)
  where ancestry_uid is not null;

alter table family_children
  add column father_relation text,
  add column mother_relation text;

alter type individual_event_type add value if not exists 'military';
