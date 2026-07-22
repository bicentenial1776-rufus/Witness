-- Ancestry's numeric tree id, captured from the GEDCOM header
-- (HEAD.SOUR._TREE.RIN) at import. With individuals.gedcom_xref
-- (@I<personId>@ in Ancestry exports) it reconstructs the person's page:
-- https://www.ancestry.com/family-tree/person/tree/<tree>/person/<person>/facts
-- Null for trees exported from other platforms.
alter table trees add column ancestry_tree_id text;
