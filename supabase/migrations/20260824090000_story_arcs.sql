-- Story arcs + whole-ancestry syntheses (Rufus, 2026-08-24, after the
-- cemetery field-test session proved both concepts on live data).
--
-- A story arc is one founder-to-home-person descent narrative: the model
-- writes only the connective prose and world events; every name, date,
-- and place in the content is assembled server-side from the record.
-- Cached per founder — the Home lead rotates through them one per day.
--
-- A tree synthesis is the whole-ancestry essay on the Explore tab. It is
-- cached per tree and carries the tree's individual_count at generation
-- time: when the tree grows, the cached row is stale and the function
-- regenerates — the essay "morphs" with the record.

create table story_arcs (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  founder_id uuid not null references individuals (id) on delete cascade,
  content jsonb not null,
  model text not null,
  prompt_version integer not null default 1,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  unique (founder_id, prompt_version)
);

alter table story_arcs enable row level security;

create policy "Users read their own story arcs"
  on story_arcs for select
  using (auth.uid() = user_id);

-- Writes are service-role only (the edge function), like enrichment_cache.

create index story_arcs_tree_id_idx on story_arcs (tree_id);
create index story_arcs_user_created_idx on story_arcs (user_id, created_at);

create table tree_syntheses (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  content jsonb not null,
  -- Tree size at generation time; drift against trees.individual_count
  -- is the staleness signal.
  individual_count integer not null,
  ancestor_count integer not null,
  fact_count integer not null,
  model text not null,
  prompt_version integer not null default 1,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  unique (tree_id, prompt_version)
);

alter table tree_syntheses enable row level security;

create policy "Users read their own tree synthesis"
  on tree_syntheses for select
  using (auth.uid() = user_id);

create index tree_syntheses_user_created_idx on tree_syntheses (user_id, created_at);
