-- Family sharing survives "Update from a newer file".
--
-- 2026-09-18: Rufus refreshed his tree on 2026-09-12 and four pending
-- invitations vanished. applyRefresh (packages/core/src/pulse/refresh.ts)
-- carries briefs, marks, share links, notes, corrections and the rest to the
-- new tree, but never invites or tree_members; when the old tree retired,
-- both cascaded away with it. This function moves them, and refresh calls
-- it just before retiring the old tree.
--
-- Security definer, because the owner may manage invites but may not update
-- tree_members rows (members update their own seat only). It checks that
-- the caller owns BOTH trees. A member's home person, which points at an
-- individual of the old tree, is re-pointed by GEDCOM xref where the new
-- tree has that person, else cleared (as the FK would on delete).

create or replace function public.carry_tree_sharing(p_old_tree_id uuid, p_new_tree_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_invites integer;
  n_members integer;
begin
  if not exists (select 1 from trees where id = p_old_tree_id and user_id = auth.uid())
     or not exists (select 1 from trees where id = p_new_tree_id and user_id = auth.uid()) then
    raise exception 'carry_tree_sharing: both trees must belong to the caller';
  end if;

  update invites
     set tree_id = p_new_tree_id
   where tree_id = p_old_tree_id;
  get diagnostics n_invites = row_count;

  -- Members already on the new tree keep their row there; everyone else
  -- moves, with the home person carried by xref.
  update tree_members m
     set tree_id = p_new_tree_id,
         home_person_id = (
           select n.id
             from individuals o
             join individuals n on n.gedcom_xref = o.gedcom_xref and n.tree_id = p_new_tree_id
            where o.id = m.home_person_id
            limit 1
         )
   where m.tree_id = p_old_tree_id
     and not exists (select 1 from tree_members x where x.tree_id = p_new_tree_id and x.user_id = m.user_id);
  get diagnostics n_members = row_count;

  return jsonb_build_object('invites', n_invites, 'members', n_members);
end;
$$;

revoke execute on function public.carry_tree_sharing(uuid, uuid) from public;
grant execute on function public.carry_tree_sharing(uuid, uuid) to authenticated;
