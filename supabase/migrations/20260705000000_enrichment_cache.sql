-- Phase 3: AI enrichment cache. One row per (individual, enrichment_type);
-- generated once server-side by the enrichment Edge Function, then served
-- from here forever. Rows double as the rate-limit ledger: counting a
-- user's rows created today = AI generations used today (cache hits are
-- reads and don't add rows).

create type enrichment_type as enum ('biography', 'historical_context');

create table enrichment_cache (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals (id) on delete cascade,
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  enrichment_type enrichment_type not null,
  content text not null,
  model text not null,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  unique (individual_id, enrichment_type)
);

create index enrichment_cache_user_created_idx on enrichment_cache (user_id, created_at);
create index enrichment_cache_individual_idx on enrichment_cache (individual_id);

alter table enrichment_cache enable row level security;

-- Users can read their own enrichments; only the service role (the Edge
-- Function) writes, so no insert/update/delete policy for users.
create policy "Users read their own enrichments" on enrichment_cache
  for select using (auth.uid() = user_id);
