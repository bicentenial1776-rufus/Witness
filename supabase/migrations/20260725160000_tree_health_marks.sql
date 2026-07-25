-- Tree Health "Fixed" marks: the user's own tally of which audit
-- findings they've already corrected at the source (Ancestry etc.).
-- Keyed by tree_id on purpose — a fresh GEDCOM upload is a new tree, so
-- every mark falls away with the old tree's cascade delete, exactly the
-- promised behavior ("corrected records fall off on the next upload").
-- finding_key is the audit's stable fingerprint: check id + the sorted
-- individual ids it accuses.

create table tree_health_marks (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  finding_key text not null,
  created_at timestamptz not null default now(),
  unique (tree_id, finding_key)
);

create index tree_health_marks_tree_idx on tree_health_marks (tree_id);

alter table tree_health_marks enable row level security;

create policy "Users manage their own tree health marks" on tree_health_marks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
