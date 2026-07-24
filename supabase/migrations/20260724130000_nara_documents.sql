-- "Papers of this place": National Archives (NARA) Catalog documents matched
-- to ancestors as confirm/dismiss candidates, surfaced on the place screen
-- and (once confirmed) on the ancestor's page. Populated exclusively by the
-- nara-enrich Edge Function on a pg_cron cadence — the NARA key is a server
-- secret and the 10,000-calls/month quota means no client ever queries NARA
-- directly. Name matching is noisy by nature, so rows are always candidates
-- a person confirms; nothing auto-attaches.

create type nara_candidate_status as enum ('pending', 'confirmed', 'dismissed');

-- Global cache of NARA records, shared across all trees (public catalog
-- data, same philosophy as geocode reuse: one fetch serves everyone).
create table nara_documents (
  na_id bigint primary key,
  title text not null,
  level_of_description text,
  record_group text,
  start_year integer,
  end_year integer,
  object_url text,
  object_count integer not null default 0,
  use_restriction text,
  fetched_at timestamptz not null default now()
);

alter table nara_documents enable row level security;
create policy "Catalog documents are readable by all signed-in users" on nara_documents
  for select using (auth.role() = 'authenticated');

-- One row per (individual, document) the worker thought might be them.
create table nara_candidates (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  individual_id uuid not null references individuals (id) on delete cascade,
  place_id uuid references places (id) on delete set null,
  na_id bigint not null references nara_documents (na_id),
  series text not null,
  score real,
  match_reason text,
  status nara_candidate_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (individual_id, na_id)
);

create index nara_candidates_tree_place_idx on nara_candidates (tree_id, place_id);
create index nara_candidates_individual_idx on nara_candidates (individual_id);

alter table nara_candidates enable row level security;
create policy "Users read their own candidates" on nara_candidates
  for select using (auth.uid() = user_id);
-- Confirm/dismiss only; inserts come from the service-role worker.
create policy "Users resolve their own candidates" on nara_candidates
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Which individuals the worker has already looked at (hit or miss), so the
-- queue drains once and unmatchable people are not retried forever —
-- the same contract as places.geocoded_at.
create table nara_enrichment_state (
  individual_id uuid primary key references individuals (id) on delete cascade,
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  calls_used integer not null default 0,
  candidates_found integer not null default 0,
  enriched_at timestamptz not null default now()
);

alter table nara_enrichment_state enable row level security;
create policy "Users read their own enrichment state" on nara_enrichment_state
  for select using (auth.uid() = user_id);

-- Monthly ledger against the 10,000-calls/month NARA quota. The worker
-- refuses to run once the month's row reaches its in-code budget.
create table nara_api_calls (
  month text primary key,
  calls integer not null default 0
);
alter table nara_api_calls enable row level security;

-- Mutual exclusion for overlapping worker invocations, same primitive as
-- geocode_ticks but on a ten-minute bucket.
create table nara_ticks (
  bucket text primary key,
  created_at timestamptz not null default now()
);
alter table nara_ticks enable row level security;

-- The anon key in the Authorization header only satisfies the edge
-- function's JWT gate; it is the same public key every app build embeds.
select cron.schedule(
  'nara-enrich-worker',
  '*/10 * * * *',
  $$
  delete from nara_ticks where created_at < now() - interval '1 day';
  select net.http_post(
    url := 'https://bdjsahbjptpcmouqozvs.supabase.co/functions/v1/nara-enrich',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkanNhaGJqcHRwY21vdXFvenZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDIzODksImV4cCI6MjA5ODUxODM4OX0.9R2xtDg0TYRIs1HRhymt_hf6Npwq6lkTfGCAJVcZy5Q'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
