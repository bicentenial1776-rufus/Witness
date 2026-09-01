-- Family sharing phase 2: every member their own point of view (design
-- brief §3). The relationships cache was keyed (tree_id, home_person_id,
-- individual_id) from the single-owner days — under sharing, a companion
-- who picks the same home person as the owner (or as another companion)
-- would collide with rows they cannot update. The key gains user_id: one
-- computed perspective per person per account. The two writers
-- (compute-relationships edge fn, setHomePerson in @witness/core) name
-- the new key in their onConflict in the same change.

alter table relationships
  drop constraint relationships_tree_id_home_person_id_individual_id_key;

alter table relationships
  add constraint relationships_per_user_key
  unique (tree_id, user_id, home_person_id, individual_id);
