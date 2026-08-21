-- The read-mark (Betsey's ask, 2026-08-19): "some indication that I had
-- already read the brief story… I keep coming back to a person and
-- realizing I've been there before." One row per (user, ancestor),
-- written when their portrait opens — the visit, not the story, is the
-- unit, since the realization she describes happens at the person.
-- Server-side so the mark follows her from iPad to web.

create table ancestor_visits (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals (id) on delete cascade,
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  first_visited_at timestamptz not null default now(),
  last_visited_at timestamptz not null default now(),
  unique (user_id, individual_id)
);

create index ancestor_visits_individual_idx on ancestor_visits (individual_id);

alter table ancestor_visits enable row level security;

create policy "Users manage their own visits" on ancestor_visits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
