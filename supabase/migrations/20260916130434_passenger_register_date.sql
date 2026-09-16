-- What the port register itself says beyond the name: the date the
-- certificate was sworn and where the ship was bound. Hotten's London
-- registers carry both on every certificate block; reconstructions
-- (Banks, the Wikipedia lists) carry neither, so both are nullable.
-- register_date is a partial ISO date — '1635-12-25', or '1635-12' when
-- the day did not survive the OCR — kept as text for that reason.
alter table passenger_candidates
  add column register_date text,
  add column bound_for text;
