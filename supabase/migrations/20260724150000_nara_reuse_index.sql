-- Cross-tree NARA reuse (nara-enrich worker) looks up "the same person in
-- another tree" — identical full name + birth year — before spending any of
-- the monthly API budget on a search that has already been run.
create index individuals_identity_idx on individuals (full_name, birth_year);
