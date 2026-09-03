-- Historical Record Registers — the framework tables
-- (docs/witness-historical-record-registers-package.md, Phase 1).
--
-- A register is a named public-domain record set (Acadian Deportation,
-- Civil War regiments, BLM land patents…) served three ways: A = curated
-- person rows matched to the tree, B = entity rows whose events attach to
-- a person, C = deep-link out with a structured save-back. The shipped
-- one-offs (passenger_candidates, nara_*, grave_confirmations) stay as
-- they are — these tables serve NEW registers only, copying their proven
-- shapes: global reference data readable by any authenticated user,
-- per-user verdict rows, and card fields denormalized onto the link so a
-- re-seed of the reference data never breaks what a researcher confirmed.

-- The catalog. Rows are seeded by scripts (service role); the app reads.
create table registers (
  register_key text primary key,
  display_name text not null,
  variant text not null check (variant in ('A', 'B', 'C')),
  provenance_label text not null,
  -- Shown on every card when present ("Confederate records are thin…").
  coverage_caveat text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  -- Exposure weights, match weights, thresholds, deep-link template,
  -- optional confirm-event spec, marker style. Shape owned by
  -- packages/core/src/registers/types.ts.
  config jsonb not null default '{}'::jsonb
);

-- Variant A/B reference rows. Ids are deterministic slugs minted by the
-- seed scripts so a re-seed replaces rather than duplicates.
create table register_records (
  id text primary key,
  register_key text not null references registers (register_key) on delete cascade,
  record_kind text not null check (record_kind in ('person', 'entity')),
  name_as_recorded text not null,
  surname_normalized text,
  given_normalized text,
  -- Variant B: the canonical entity key ("54th Massachusetts Infantry").
  entity_key text,
  -- Register-specific fields, validated by the register's seed script.
  attributes jsonb not null default '{}'::jsonb,
  -- "No passenger fact is authored by Witness" — every row cites its
  -- public-domain transcription; the finding aid is a link, not a source.
  source_citation text not null,
  finding_aid_url text,
  transcription_confidence text
);
create index register_records_key_surname_idx
  on register_records (register_key, surname_normalized);
create index register_records_entity_idx
  on register_records (register_key, entity_key)
  where entity_key is not null;

-- Dated, placed events on a record — Variant B unit movements, or a
-- Variant A record's own dates where the primary source gives them.
create table register_record_events (
  id uuid primary key default gen_random_uuid(),
  record_id text not null references register_records (id) on delete cascade,
  event_type text not null,
  event_date date,
  event_year integer,
  event_end_year integer,
  place_text text,
  latitude double precision,
  longitude double precision,
  -- e.g. an NPS battle id, joining an external reference table later.
  linked_event_ref text,
  source_citation text not null
);
create index register_record_events_record_idx on register_record_events (record_id);

-- The person↔record link: the researcher's verdict, and for Variant C the
-- structured save-back. Card fields ride on the row (record_name,
-- record_summary) so the card never needs a join into reference data that
-- a wider seed may have replaced under it.
create table person_register_links (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  individual_id uuid not null references individuals (id) on delete cascade,
  register_key text not null references registers (register_key),
  -- Null for Variant C (no reference row) and after a reference row is
  -- retired by a narrower re-seed; the snapshot columns keep the card whole.
  record_id text references register_records (id) on delete set null,
  status text not null default 'candidate'
    check (status in ('parsed_from_gedcom', 'candidate', 'confirmed', 'rejected')),
  match_score real,
  -- Plain-words reasons — "the reasons are the useful part".
  match_reasons jsonb not null default '[]'::jsonb,
  record_name text,
  record_summary text,
  source_citation text,
  finding_aid_url text,
  -- Variant C structured save-back: URL, key fields, geocode.
  saved_payload jsonb,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index person_register_links_tree_idx on person_register_links (tree_id);
create index person_register_links_individual_idx on person_register_links (individual_id);
-- One link per (person, register, record) where a record exists; Variant C
-- rows (record_id null) may accumulate — several land patents are several
-- records.
create unique index person_register_links_unique_record
  on person_register_links (individual_id, register_key, record_id)
  where record_id is not null;

-- RLS: reference data is world-readable to signed-in users and written
-- only by the service role (no client write policies at all); links are
-- the user's own rows, the passenger_candidates posture. When a server
-- worker starts inserting candidates, split the link policies the way
-- nara_candidates does (select + update for users, inserts from the
-- worker) — that split arrives with the worker, not before.
alter table registers enable row level security;
alter table register_records enable row level security;
alter table register_record_events enable row level security;
alter table person_register_links enable row level security;

create policy "registers are readable" on registers
  for select using (auth.role() = 'authenticated');
create policy "register records are readable" on register_records
  for select using (auth.role() = 'authenticated');
create policy "register record events are readable" on register_record_events
  for select using (auth.role() = 'authenticated');
create policy "own register links" on person_register_links
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The findings ledger learns the register source. Finding ids carry the
-- register key: `register:<register_key>:<individual_id>:<record_id>`.
alter table findings drop constraint findings_source_check;
alter table findings add constraint findings_source_check
  check (source in ('tree-health', 'archives', 'crossing', 'migration', 'register'));
