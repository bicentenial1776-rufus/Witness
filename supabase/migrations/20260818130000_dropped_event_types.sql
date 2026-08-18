-- The parser silently dropped CENS, BAPM, IMMI, EMIG, and NATU records
-- (Katie Grafer review, 2026-08-15) — census rows especially are the raw
-- material for household and relational-geography work. The parser now
-- captures them; these enum values let the importer write them. Existing
-- trees gain the events on their next import or refresh (the vault copies
-- hold the dropped data, so nothing needs re-exporting).
alter type individual_event_type add value if not exists 'census';
alter type individual_event_type add value if not exists 'baptism';
alter type individual_event_type add value if not exists 'immigration';
alter type individual_event_type add value if not exists 'emigration';
alter type individual_event_type add value if not exists 'naturalization';
