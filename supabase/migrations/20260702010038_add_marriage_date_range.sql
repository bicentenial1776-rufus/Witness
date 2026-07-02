-- individual_events carries date_range_start_year/date_range_end_year for
-- BET...AND... dates but families.marriage_date_* was missing the same
-- columns, which would silently drop the range on import.

alter table families
  add column marriage_date_range_start_year integer,
  add column marriage_date_range_end_year integer;
