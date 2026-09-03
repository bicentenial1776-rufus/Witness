-- The Crossing card: ship-passenger matches against the immigrant-ships
-- dataset (packages/core/src/history/passengers.ts), surfaced on the
-- Portrait as confirm/dismiss candidates — same doctrine as nara_candidates
-- and grave_captures: a match is a candidate to investigate, never a claim
-- that an ancestor sailed. Matching is deterministic (soundex + year
-- tolerance, no external API), so unlike nara_candidates there is no
-- service-role worker yet — rows are written by the tree owner, today via
-- `match-passengers.ts --write` (see data/immigrant-ships/README.md), the
-- same authenticated path the app itself uses.

create type passenger_candidate_status as enum ('pending', 'confirmed', 'dismissed');

create table passenger_candidates (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  individual_id uuid not null references individuals (id) on delete cascade,
  -- Keys into the static dataset (data/immigrant-ships/*.json), not a
  -- foreign key — voyages and passengers are not database tables.
  voyage_id text not null,
  passenger_id text not null,
  ship text not null,
  arrival_year integer not null,
  departure_port text,
  arrival_place text,
  passenger_name text not null,
  passenger_birth_year integer,
  passenger_death_year integer,
  -- Per-row provenance from the transcribed list — "no passenger fact is
  -- authored by Witness" (PROJECT_BRIEF.md).
  source text not null,
  confidence text not null check (confidence in ('strong', 'probable', 'weak')),
  reasons text[] not null default '{}',
  status passenger_candidate_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (individual_id, passenger_id)
);

create index passenger_candidates_tree_idx on passenger_candidates (tree_id);
create index passenger_candidates_individual_idx on passenger_candidates (individual_id);

alter table passenger_candidates enable row level security;

create policy "own passenger candidates" on passenger_candidates
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
