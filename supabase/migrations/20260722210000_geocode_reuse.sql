-- Reuse-on-import: place strings repeat enormously across trees (a re-import
-- matched 96% of an existing tree; even a stranger's tree matched 14%), so a
-- fresh import copies coordinates for every place string any tree has already
-- resolved, and only never-seen places wait for the geocoding worker.
--
-- security definer: the source coordinates live in other users' rows, which
-- RLS hides from the caller. The function only reads (raw, lat, lng) from
-- them — no genealogical data — and only writes to trees the caller owns.
create or replace function reuse_geocodes(p_tree_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated integer;
begin
  if not exists (select 1 from trees where id = p_tree_id and user_id = auth.uid()) then
    raise exception 'tree not found or not owned by caller';
  end if;

  update places dst
  set latitude = src.latitude,
      longitude = src.longitude,
      geocoded_at = now()
  from (
    select distinct on (raw) raw, latitude, longitude
    from places
    where latitude is not null
  ) src
  where dst.tree_id = p_tree_id
    and dst.geocoded_at is null
    and dst.raw = src.raw;

  get diagnostics updated = row_count;
  return updated;
end;
$$;
