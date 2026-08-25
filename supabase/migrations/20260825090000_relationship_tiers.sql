-- Relationship tiers (docs/witness-relationship-taxonomy-spec.md).
--
-- The cache was blood-only: everyone connected by marriage was computed,
-- found non-blood, and dropped, so list views showed a married-in person
-- and a stranger identically. Rows now carry a tier — direct, blood, or
-- distant — and the married-in ones are stored. 'none' is still never
-- stored: absence is the reading.
alter table relationships
  add column tier text,
  add column qualifier text;

-- Every existing row predates the distant tier, so its tier follows from
-- the flags it already carries.
update relationships
  set tier = case
    when is_direct_ancestor or is_direct_descendant then 'direct'
    else 'blood'
  end
  where tier is null;

-- Shipped clients predate the tier column and still insert rows without
-- it (the precompute runs on device). Derive the tier from the flags
-- they do send, so the not-null constraint below doesn't break them.
create or replace function relationships_default_tier() returns trigger
language plpgsql as $$
begin
  if new.tier is null then
    new.tier := case
      when new.is_direct_ancestor or new.is_direct_descendant then 'direct'
      else 'blood'
    end;
  end if;
  return new;
end;
$$;

create trigger relationships_default_tier
  before insert on relationships
  for each row execute function relationships_default_tier();

alter table relationships
  alter column tier set not null,
  add constraint relationships_tier_check check (tier in ('direct', 'blood', 'distant')),
  add constraint relationships_qualifier_check
    check (qualifier is null or qualifier in ('adoptive', 'foster', 'birth'));

comment on column relationships.tier is
  'direct | blood | distant — the broad category behind the lineage mark.';
comment on column relationships.qualifier is
  'adoptive | foster | birth — set when the label names a non-birth parent link.';

create index relationships_tier_idx on relationships (tree_id, tier);
