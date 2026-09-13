-- Confirm-event templates every client can fill. The {record_summary}
-- placeholder is new today; App Store builds that predate it replace
-- only {record_name} / {register_label} / {source} and would write the
-- placeholder itself into a burial event. So the cemetery rides in the
-- VA record's NAME (the worker now writes "Name (years) — Cemetery,
-- Town, ST"), the AAD save-back's record name carries the enlistment,
-- and both templates read {record_name}. Data only; no client depends
-- on it. The one VA candidate already offered is released so the
-- worker re-offers it in the new shape.
update registers
  set config = jsonb_set(config, '{confirmEvent,detailTemplate}', '"{record_name} — {register_label}"')
  where register_key = 'va-burials';

update registers
  set config = jsonb_set(
    jsonb_set(
      jsonb_set(config, '{confirmEvent,detailTemplate}', '"{record_name} — {register_label}"'),
      '{saveBack,recordNameTemplate}', '"Enlisted {enlistment_date} at {enlistment_place} · Army serial number {serial_number}"'),
    '{saveBack,summaryTemplate}', '"{grade} — {branch} · of {residence} · born {birthplace} · {education} · {civilian_occupation} · {marital_status}"')
  where register_key = 'aad-wwii-enlistment';

delete from person_register_links where register_key = 'va-burials' and status = 'candidate';
delete from register_enrichment_state where register_key = 'va-burials';
