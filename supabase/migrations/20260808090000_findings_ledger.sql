-- The findings ledger — Approach A's persistence (docs/cohesion-design-brief.md).
--
-- Row shape mirrors @witness/core/findings Finding: a stable id, the emitting
-- source, the subjects, one editorial sentence. Two jobs:
--   1. The ledger: everything Witness has noticed about a tree, queryable
--      per person without re-running a client-side audit.
--   2. Back issues: edition_key stamps the ISO week a piece was printed in
--      The Issue, so past editions can be re-read (the Library as archive).
--
-- Written client-side when an edition is composed (upsert, fire-and-forget);
-- decisions continue to live where they always have (tree_health_marks,
-- tree_health_rulings, nara_candidates) — this table records what was
-- noticed and printed, not what was judged.

create table findings (
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The core Finding.id: 'tree-health:…' / 'archives:…' / 'crossing:…' / 'migration:…'
  finding_id text not null,
  source text not null check (source in ('tree-health', 'archives', 'crossing', 'migration')),
  subject_ids uuid[] not null default '{}',
  sentence text not null,
  -- ISO edition that first printed it, e.g. '2026-W32'; null = noticed, never printed.
  edition_key text,
  -- Which desk ran it: 'lead' | 'tree-check' | 'archives' | 'pattern'.
  section text,
  first_seen_at timestamptz not null default now(),
  primary key (tree_id, finding_id)
);

-- Per-person reads ("everything about Patrick") and per-edition reads
-- ("issue 2026-W32, in print order").
create index findings_subject_ids_idx on findings using gin (subject_ids);
create index findings_edition_idx on findings (tree_id, edition_key);

alter table findings enable row level security;

create policy "Users manage their own findings" on findings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
