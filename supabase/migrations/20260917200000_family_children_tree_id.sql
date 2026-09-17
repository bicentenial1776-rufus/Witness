-- family_children carried no tree_id, so every whole-tree page over it
-- (treeIndex.ts, treeHealth.ts, family/precompute.ts and its Deno mirror)
-- filtered through an embedded join to families — 9–20 s per 10,000-row page
-- on a 61,773-person tree (2026-09-17), the last of the whole-tree fetches
-- that the covering indexes could not reach.
--
-- The column is backfilled from families; a BEFORE INSERT trigger fills it
-- when an older client (an iOS build importing without it) omits it. The
-- covering index makes each page an index-only scan, as on the other tables.
--
-- Applied to production by hand: the ALTER/UPDATE/trigger as one batch, then
-- CREATE INDEX CONCURRENTLY and VACUUM (ANALYZE) separately; recorded with
-- `supabase migration repair --status applied 20260917200000`.
alter table public.family_children
  add column if not exists tree_id uuid references public.trees (id) on delete cascade;

update public.family_children fc
   set tree_id = f.tree_id
  from public.families f
 where f.id = fc.family_id
   and fc.tree_id is null;

create or replace function public.family_children_fill_tree_id()
returns trigger
language plpgsql
as $$
begin
  if new.tree_id is null then
    select tree_id into new.tree_id from public.families where id = new.family_id;
  end if;
  return new;
end;
$$;

drop trigger if exists family_children_fill_tree_id on public.family_children;
create trigger family_children_fill_tree_id
  before insert on public.family_children
  for each row execute function public.family_children_fill_tree_id();

create index if not exists family_children_tree_id_covering_idx
  on public.family_children (tree_id, family_id, individual_id)
  include (birth_order, father_relation, mother_relation, user_id);
