-- Facts the GEDCOM carries beyond the core five event types: occupations
-- (OCCU), Ancestry custom events (EVEN with a TYPE name), and probate
-- records. `label` holds the custom event's name ("Citizenship"); `detail`
-- holds free-text payloads (an occupation title, a custom event's value).
-- These feed the biography prompt, which until now never saw them.

alter type individual_event_type add value if not exists 'occupation';
alter type individual_event_type add value if not exists 'custom';
alter type individual_event_type add value if not exists 'probate';

alter table individual_events
  add column label text,
  add column detail text;
