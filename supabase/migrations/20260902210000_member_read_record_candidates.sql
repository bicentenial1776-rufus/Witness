-- Family members read record candidates (Rufus, 2026-09-02: "If I were
-- to respond with 'this is them' then anyone in my family sharing would
-- see the result of this action — not have to repeat it").
--
-- The family-sharing phase-1 migration gave members read policies on the
-- tree tables but predates person_register_links and skipped
-- passenger_candidates, so a member opening a shared tree saw no Crossing
-- cards and an empty voyage roster. These two policies close that gap the
-- same way every other shared table works: one additive PERMISSIVE select
-- through member_tree_ids(). Writes stay owner-only — the verdict is the
-- tree owner's, and the app hides the buttons for members.

create policy "Members read shared passenger candidates" on passenger_candidates
  for select using (tree_id in (select member_tree_ids()));

create policy "Members read shared register links" on person_register_links
  for select using (tree_id in (select member_tree_ids()));
