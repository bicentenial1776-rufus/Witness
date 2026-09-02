-- Invitations learn who they're for (Rufus, 2026-09-02 family E2E):
-- "I can't see who I sent the invite to" — the You screen showed two
-- anonymous "Invitation waiting" rows. And a family member who signed in
-- WITHOUT her invite link in that browser hit the hard paywall and walked
-- into checkout; the passive "holding an invitation?" line didn't save
-- her.
--
-- One column carries both fixes: the owner names the recipient at
-- creation ("Who is this for?" — a name, or an email). The name labels
-- the pending row. When it's an email, get_waiting_seat() lets the
-- paywall find the seat kept for the signed-in account and offer it
-- actively — the token goes only to the very account whose email the
-- owner typed on the invitation.

alter table invites add column invited_name text;

create or replace function get_waiting_seat()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'token', i.token,
    'treeName', t.name,
    'inviterName', split_part(coalesce(hp.full_name, ''), ' ', 1)
  )
  from invites i
  join trees t on t.id = i.tree_id
  left join individuals hp on hp.id = t.home_person_id
  where lower(i.invited_name) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and i.invited_name like '%@%'
    and i.revoked_at is null
    and i.accepted_at is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1
$$;
