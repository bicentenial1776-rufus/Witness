-- The partial unique index on person_register_links cannot back
-- PostgREST's ON CONFLICT inference (the predicate can't be expressed
-- through the API), so upserts from match-registers failed. A plain
-- unique index has the same semantics — NULL record_ids never conflict,
-- so Variant C save-backs still accumulate freely — and supports
-- inference for the (individual, register, record) triple.
drop index person_register_links_unique_record;
create unique index person_register_links_unique_record
  on person_register_links (individual_id, register_key, record_id);
