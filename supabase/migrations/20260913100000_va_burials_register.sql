-- Veterans' gravesites — the va-burials register and the first
-- worker-fed register (docs/historical-record-registers.md, "Variant C
-- with a worker"). The National Cemetery Administration's Nationwide
-- Gravesite Locator is 8.4M rows on data.va.gov, far too large to seed as
-- a register CSV, so the va-enrich edge function queries it live per
-- person on a pg_cron cadence and writes candidates. Two generic tables
-- arrive with it, keyed by register so the next worker-fed register (AAD
-- enlistments, obituaries) needs no new schema.

-- Which people a register's worker has already examined (hit or miss),
-- so the queue drains once — nara_enrichment_state, generalized.
create table register_enrichment_state (
  register_key text not null references registers (register_key) on delete cascade,
  individual_id uuid not null references individuals (id) on delete cascade,
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  calls_used integer not null default 0,
  candidates_found integer not null default 0,
  enriched_at timestamptz not null default now(),
  primary key (register_key, individual_id)
);
create index register_enrichment_state_tree_idx on register_enrichment_state (tree_id);
alter table register_enrichment_state enable row level security;
create policy "Users read their own register enrichment state" on register_enrichment_state
  for select using (auth.uid() = user_id);

-- Mutual exclusion for overlapping worker invocations, per register —
-- nara_ticks, generalized.
create table register_ticks (
  register_key text not null,
  bucket text not null,
  created_at timestamptz not null default now(),
  primary key (register_key, bucket)
);
alter table register_ticks enable row level security;

-- The worker's queue: unexamined, dead, with a death year the register
-- can cover, oldest tree first (the geocode worker's fairness rule).
-- Service role only — the anti-join is a plain SQL left join here rather
-- than a PostgREST embed, which cannot filter the embedded side without
-- letting every parent row through (the nara re-search bug).
create or replace function register_enrichment_queue(
  p_register_key text,
  p_limit integer,
  p_min_death_year integer,
  p_tree_id uuid default null
)
returns table (
  id uuid,
  tree_id uuid,
  user_id uuid,
  full_name text,
  given_name text,
  surname text,
  sex sex_type,
  birth_year integer,
  death_year integer
)
language sql
stable
set search_path = public
as $$
  select i.id, i.tree_id, i.user_id, i.full_name, i.given_name, i.surname, i.sex,
         i.birth_year, i.death_year
  from individuals i
  join trees t on t.id = i.tree_id
  left join register_enrichment_state s
    on s.register_key = p_register_key and s.individual_id = i.id
  where s.individual_id is null
    and not i.living
    and i.death_year is not null
    and i.death_year >= p_min_death_year
    -- surname/given_name columns are null across whole imports; the
    -- worker splits full_name, so only the full name is required.
    and i.full_name is not null and i.full_name <> ''
    and (p_tree_id is null or i.tree_id = p_tree_id)
  order by t.imported_at asc, i.id
  limit p_limit;
$$;
revoke execute on function register_enrichment_queue(text, integer, integer, uuid) from public;
revoke execute on function register_enrichment_queue(text, integer, integer, uuid) from anon;
revoke execute on function register_enrichment_queue(text, integer, integer, uuid) from authenticated;
grant execute on function register_enrichment_queue(text, integer, integer, uuid) to service_role;

-- The catalog row, the same content as data/registers/va-burials/
-- register.json (the seed script upserts the same row; this makes the
-- worker runnable the moment the migration lands).
insert into registers (register_key, display_name, variant, provenance_label, coverage_caveat, status, config)
values (
  'va-burials',
  'Veterans’ gravesites (National Cemetery Administration)',
  'C',
  'From the Nationwide Gravesite Locator (National Cemetery Administration)',
  'The locator holds burials in national and state veterans cemeteries, and private-cemetery graves only where the government furnished the marker — mostly after 1997. Most of its people died after 1940. The open copy Witness reads was last refreshed in November 2022. An ancestor missing here may simply lie elsewhere.',
  'active',
  $json$
  {
    "worker": {
      "source": "https://www.data.va.gov/resource/3u66-fxug.json",
      "minDeathYear": 1860,
      "note": "Fed by the va-enrich edge function, not by match-records: the dataset is 8.4 million rows and is queried live per person (surname + first given name, upper-cased), then scored in packages/core/src/registers/vaBurials.ts. Death year must agree within a year or the row is never offered."
    },
    "confirmEvent": { "eventType": "burial", "detailTemplate": "{record_summary} — {register_label}" },
    "deepLinkTemplate": "https://gravelocator.cem.va.gov/",
    "markerStyle": "gravesite",
    "explainer": "The National Cemetery Administration keeps a public locator of veterans and their family members buried in national cemeteries, in state and tribal veterans cemeteries, and in private cemeteries where the government furnished a headstone or marker. Its records run from the Civil War era to the present, most of them for people who died after 1940, and each carries the branch, rank, war, and the cemetery’s location. Witness reads the open copy published on data.va.gov and offers a match only when the name and the death year agree; you decide whether it is them. A spouse or child buried beside a veteran appears under their own name, with the veteran named on the record."
  }
  $json$::jsonb
)
on conflict (register_key) do update
  set display_name = excluded.display_name,
      variant = excluded.variant,
      provenance_label = excluded.provenance_label,
      coverage_caveat = excluded.coverage_caveat,
      status = excluded.status,
      config = excluded.config;

-- Every ten minutes, offset from nara-enrich so the two workers never
-- share a tick. Secret from Vault, the cron_secret_gate pattern; the anon
-- key only satisfies the gateway's JWT check.
select cron.schedule(
  'va-enrich-worker',
  '5,15,25,35,45,55 * * * *',
  $$
  delete from register_ticks where created_at < now() - interval '1 day';
  select net.http_post(
    url := 'https://bdjsahbjptpcmouqozvs.supabase.co/functions/v1/va-enrich',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkanNhaGJqcHRwY21vdXFvenZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDIzODksImV4cCI6MjA5ODUxODM4OX0.9R2xtDg0TYRIs1HRhymt_hf6Npwq6lkTfGCAJVcZy5Q',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
