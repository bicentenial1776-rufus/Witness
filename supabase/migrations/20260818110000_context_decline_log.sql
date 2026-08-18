-- QA log for the general-knowledge historical tier
-- (witness-family-context-spec.md §7.7): when the model declines the tier
-- rather than guess, the decline itself is recorded — person, place, and
-- period in the content JSON — under its own enrichment_type. The UI never
-- queries this type; it exists so tier silence is measurable:
--   select count(*) from enrichment_cache
--   where enrichment_type = 'historical_context_decline';
alter type enrichment_type add value if not exists 'historical_context_decline';
