-- Ancestry identity on a tree that did not come from Ancestry.
--
-- The Family Tree Maker export is the only door to the family's media, but
-- it renumbers people and drops Ancestry's tree id, person ids, record
-- ids (_APID) and record links — so the Portrait's "Ancestry ›" button and
-- the Sources tab's record links died with the 2026-09-11 FTM import. An
-- Ancestry export, taken once, carries all of them. The overlay script
-- (packages/core/scripts/overlay-ancestry-ids.ts) matches its people onto
-- the FTM tree by name and years and hands the results to
-- apply_ancestry_identity(); carry_ancestry_identity() moves them onto the
-- next FTM refresh by GEDCOM xref (FTM's numbering is stable across its
-- own exports) so the Ancestry file is never needed again.

alter table individuals add column if not exists ancestry_person_id text;
create index if not exists individuals_ancestry_person_idx
  on individuals (tree_id, ancestry_person_id) where ancestry_person_id is not null;

-- The overlay's write: people ids and citation links in one call, under
-- the caller's own row policies (the tree owner updates their own rows).
create or replace function apply_ancestry_identity(
  p_tree_id uuid,
  p_ancestry_tree_id text,
  p_people jsonb,
  p_citations jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_people integer := 0;
  v_citations integer := 0;
begin
  if p_ancestry_tree_id is not null then
    update trees set ancestry_tree_id = p_ancestry_tree_id where id = p_tree_id;
  end if;

  update individuals i
     set ancestry_person_id = p.ancestry_person_id
    from jsonb_to_recordset(coalesce(p_people, '[]'::jsonb))
         as p(id uuid, ancestry_person_id text)
   where i.id = p.id and i.tree_id = p_tree_id;
  get diagnostics v_people = row_count;

  update citations c
     set url = coalesce(c.url, p.url),
         ancestry_apid = coalesce(c.ancestry_apid, p.ancestry_apid)
    from jsonb_to_recordset(coalesce(p_citations, '[]'::jsonb))
         as p(id uuid, url text, ancestry_apid text)
   where c.id = p.id and c.tree_id = p_tree_id;
  get diagnostics v_citations = row_count;

  return jsonb_build_object('people', v_people, 'citations', v_citations);
end;
$$;
revoke execute on function apply_ancestry_identity(uuid, text, jsonb, jsonb) from public;
grant execute on function apply_ancestry_identity(uuid, text, jsonb, jsonb) to authenticated;

-- Refresh carry: the identity moves from the retiring tree to the new one.
-- People match on GEDCOM xref first (the same FTM file re-exported keeps
-- its @I184@), then on a name + birth year that is unique on both sides.
-- Citations follow their person: same source title, fact, and page.
create or replace function carry_ancestry_identity(p_old_tree_id uuid, p_new_tree_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_tree integer := 0;
  v_xref integer := 0;
  v_name integer := 0;
  v_citations integer := 0;
begin
  update trees n
     set ancestry_tree_id = o.ancestry_tree_id
    from trees o
   where o.id = p_old_tree_id and n.id = p_new_tree_id
     and n.ancestry_tree_id is null and o.ancestry_tree_id is not null;
  get diagnostics v_tree = row_count;

  update individuals n
     set ancestry_person_id = o.ancestry_person_id
    from individuals o
   where o.tree_id = p_old_tree_id and n.tree_id = p_new_tree_id
     and n.ancestry_person_id is null and o.ancestry_person_id is not null
     and o.gedcom_xref = n.gedcom_xref;
  get diagnostics v_xref = row_count;

  with old_unique as (
    select lower(full_name) as k, birth_year, min(ancestry_person_id) as ancestry_person_id
      from individuals
     where tree_id = p_old_tree_id and ancestry_person_id is not null and birth_year is not null
     group by lower(full_name), birth_year having count(*) = 1
  ), new_unique as (
    select lower(full_name) as k, birth_year, min(id) as id
      from individuals
     where tree_id = p_new_tree_id and ancestry_person_id is null and birth_year is not null
     group by lower(full_name), birth_year having count(*) = 1
  )
  update individuals n
     set ancestry_person_id = ou.ancestry_person_id
    from new_unique nu join old_unique ou on ou.k = nu.k and ou.birth_year = nu.birth_year
   where n.id = nu.id and n.ancestry_person_id is null;
  get diagnostics v_name = row_count;

  update citations n
     set url = coalesce(n.url, o.url),
         ancestry_apid = coalesce(n.ancestry_apid, o.ancestry_apid)
    from citations o
    join sources os on os.id = o.source_id
    join individuals oi on oi.id = o.individual_id,
         sources ns, individuals ni
   where o.tree_id = p_old_tree_id and n.tree_id = p_new_tree_id
     and ns.id = n.source_id and ni.id = n.individual_id
     and ni.ancestry_person_id is not null and ni.ancestry_person_id = oi.ancestry_person_id
     and lower(ns.title) = lower(os.title) and n.fact = o.fact
     and coalesce(n.page, '') = coalesce(o.page, '')
     and (n.url is null or n.ancestry_apid is null)
     and (o.url is not null or o.ancestry_apid is not null);
  get diagnostics v_citations = row_count;

  return jsonb_build_object('tree', v_tree, 'people_by_xref', v_xref, 'people_by_name', v_name, 'citations', v_citations);
end;
$$;
revoke execute on function carry_ancestry_identity(uuid, uuid) from public;
grant execute on function carry_ancestry_identity(uuid, uuid) to authenticated;
