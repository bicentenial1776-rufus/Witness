-- Stories become re-tellable (Betsey's twins report, 2026-08-19): the
-- writer's inputs and instructions now carry a version, so a corrected
-- writer quietly retires every story the old one told. The client and
-- the edge function read only the current version; a bump makes the
-- "Tell me their story" button return, and the next tap writes the
-- corrected story over the old row (upsert on the same unique key).
alter table enrichment_cache
  add column prompt_version int not null default 1;

-- The stories already told predate twin awareness — any of them could
-- carry the "two children born in the same year, unexplained" mistake,
-- and the AI-authorship disclosure applies to all of them. They are
-- regenerable derivatives (the record itself is untouched); clearing
-- them is what makes the correction reach clients that don't yet
-- filter by version.
delete from enrichment_cache where enrichment_type = 'biography';
