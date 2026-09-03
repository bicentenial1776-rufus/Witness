-- Release-gate review finding (2026-09-03): "they can look; only you can
-- change" was UI-only. Every write policy checked user_id = auth.uid()
-- but never WHOSE TREE the row lands in, so a family member could insert
-- rows carrying their own user_id into the owner's tree (places, events,
-- individuals, families, candidate verdicts) — rows the owner could
-- neither see nor delete, while the rest of the family saw them.
--
-- The fix: the write half of each policy also requires owning the tree.
-- Reads keep their old shape (your rows, plus the additive member-read
-- policies). Legitimate writers all pass: the importer owns the tree it
-- just created, verdicts and At the Stone run on the owner's account,
-- and service-role writers (edge functions, seeders) bypass RLS.
-- Deliberately untouched: relationships (members' own rows are written
-- client-side on shared trees by the precompute self-heal) and
-- ancestor_notes/grave_captures (their own posture, reviewed separately).

drop policy "Users manage their own places" on places;
create policy "Users manage their own places" on places
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id and is_tree_owner(tree_id));

drop policy "Users manage their own individuals" on individuals;
create policy "Users manage their own individuals" on individuals
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id and is_tree_owner(tree_id));

drop policy "Users manage their own individual events" on individual_events;
create policy "Users manage their own individual events" on individual_events
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id and is_tree_owner(tree_id));

drop policy "Users manage their own families" on families;
create policy "Users manage their own families" on families
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id and is_tree_owner(tree_id));

drop policy "own passenger candidates" on passenger_candidates;
create policy "own passenger candidates" on passenger_candidates
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_tree_owner(tree_id));

drop policy "own register links" on person_register_links;
create policy "own register links" on person_register_links
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_tree_owner(tree_id));

-- Hardening on the seat-finder (same review): only a CONFIRMED email may
-- claim the waiting seat — a squatter who signed up with the invitee's
-- address but never proved it gets nothing.
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
    and exists (
      select 1 from auth.users u
      where u.id = auth.uid() and u.email_confirmed_at is not null
    )
    and i.revoked_at is null
    and i.accepted_at is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1
$$;
