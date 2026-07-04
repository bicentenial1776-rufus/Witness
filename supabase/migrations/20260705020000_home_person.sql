-- Home person: the user's anchor individual in the tree, enabling
-- relationship-path calculation ("your 9th great-grandmother") and
-- relationship-aware queries.

alter table trees
  add column home_person_id uuid references individuals (id) on delete set null;

-- Pre-computed relationship paths from the home person. Direct ancestors
-- are cached eagerly when the home person is set; anyone else falls back
-- to on-demand calculation in the client.
create table relationships (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  home_person_id uuid not null references individuals (id) on delete cascade,
  individual_id uuid not null references individuals (id) on delete cascade,
  label text not null,
  generation_distance integer not null,
  line text not null,
  path jsonb not null,
  is_direct_ancestor boolean not null default false,
  is_direct_descendant boolean not null default false,
  is_collateral boolean not null default false,
  computed_at timestamptz not null default now(),
  unique (tree_id, home_person_id, individual_id)
);

create index relationships_tree_idx on relationships (tree_id);
create index relationships_individual_idx on relationships (individual_id);
create index relationships_direct_ancestor_idx on relationships (tree_id, is_direct_ancestor);

alter table relationships enable row level security;

-- The cache is computed client-side after the home person is chosen, so
-- users manage their own rows (unlike enrichment_cache, there is no
-- server-side secret involved — it's pure derived data).
create policy "Users manage their own relationships" on relationships
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
