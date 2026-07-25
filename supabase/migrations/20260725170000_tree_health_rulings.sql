-- "Not an error" rulings for Tree Health findings. Unlike tree_health_marks
-- (tree-scoped, dies with each upload), a ruling is the user's permanent
-- judgment that a flagged pattern is genuinely correct — Shirley Scott Howe
-- married Shirley Howe, and no re-import should ever question it again.
-- Keyed by the finding's GEDCOM-xref fingerprint (check id + the sorted
-- INDI xrefs it accuses), which is stable across uploads of the same file.

create table tree_health_rulings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  xref_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, xref_key)
);

alter table tree_health_rulings enable row level security;

create policy "Users manage their own tree health rulings" on tree_health_rulings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
