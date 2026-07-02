-- Phase 2: persistence layer for parsed GEDCOM data.
-- One row per imported file in `trees`; everything else scopes to tree_id
-- and denormalizes user_id for simple, index-friendly RLS.

create extension if not exists pgcrypto;

create type date_confidence as enum ('exact', 'approximate', 'estimated', 'unknown');

create type date_qualifier as enum (
  'exact', 'about', 'calculated', 'estimated', 'before', 'after', 'between', 'unknown'
);

create type sex_type as enum ('M', 'F', 'U');

create type individual_event_type as enum ('birth', 'death', 'burial', 'residence');

create type curiosity_type as enum (
  'child_born_before_parent',
  'death_before_birth',
  'implausible_lifespan',
  'marriage_before_birth',
  'parent_too_young',
  'parent_too_old',
  'large_sibling_date_gap'
);

-- One row per GEDCOM file a user imports.
create table trees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  source_file text,
  gedcom_version text,
  charset text,
  export_date text,
  individual_count integer not null default 0,
  family_count integer not null default 0,
  place_count integer not null default 0,
  parse_warnings jsonb not null default '[]'::jsonb,
  imported_at timestamptz not null default now()
);

-- Deduplicated place strings (parser interns these; we do the same here).
create table places (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  raw text not null,
  parts text[] not null default '{}',
  latitude double precision,
  longitude double precision,
  geocoded_at timestamptz,
  unique (tree_id, raw)
);

create table individuals (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  gedcom_xref text not null,
  full_name text not null,
  given_name text,
  surname text,
  prefix text,
  suffix text,
  sex sex_type not null default 'U',
  has_death_record boolean not null default false,
  living boolean not null default false,
  -- Denormalized from individual_events for fast temporal queries
  -- ("who was alive during year X") without joining out to events.
  birth_year integer,
  death_year integer,
  unique (tree_id, gedcom_xref)
);

-- Birth/death/burial/residence all share the same date+place shape, and
-- residences are inherently repeatable, so they live in one events table
-- rather than a wide column-per-event-type layout on individuals.
create table individual_events (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals (id) on delete cascade,
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type individual_event_type not null,
  sort_order integer not null default 0,
  place_id uuid references places (id) on delete set null,
  date_raw text,
  date_year integer,
  date_month smallint,
  date_day smallint,
  date_qualifier date_qualifier,
  date_confidence date_confidence,
  date_range_start_year integer,
  date_range_end_year integer
);

create table families (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  gedcom_xref text not null,
  husband_id uuid references individuals (id) on delete set null,
  wife_id uuid references individuals (id) on delete set null,
  marriage_place_id uuid references places (id) on delete set null,
  marriage_date_raw text,
  marriage_date_year integer,
  marriage_date_month smallint,
  marriage_date_day smallint,
  marriage_date_qualifier date_qualifier,
  marriage_date_confidence date_confidence,
  unique (tree_id, gedcom_xref)
);

create table family_children (
  family_id uuid not null references families (id) on delete cascade,
  individual_id uuid not null references individuals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  birth_order integer,
  primary key (family_id, individual_id)
);

create table curiosities (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type curiosity_type not null,
  message text not null,
  family_id uuid references families (id) on delete cascade
);

create table curiosity_individuals (
  curiosity_id uuid not null references curiosities (id) on delete cascade,
  individual_id uuid not null references individuals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (curiosity_id, individual_id)
);

-- Indexes ---------------------------------------------------------------

create index individuals_tree_id_idx on individuals (tree_id);
create index individuals_birth_year_idx on individuals (birth_year);
create index individuals_death_year_idx on individuals (death_year);
create index individuals_surname_idx on individuals (surname);

create index individual_events_individual_id_idx on individual_events (individual_id);
create index individual_events_type_year_idx on individual_events (event_type, date_year);

create index families_tree_id_idx on families (tree_id);
create index families_husband_id_idx on families (husband_id);
create index families_wife_id_idx on families (wife_id);

create index family_children_individual_id_idx on family_children (individual_id);

create index places_tree_id_idx on places (tree_id);
create index places_lat_lng_idx on places (latitude, longitude);

create index curiosities_tree_id_idx on curiosities (tree_id);
create index curiosity_individuals_individual_id_idx on curiosity_individuals (individual_id);

-- Row Level Security ------------------------------------------------------
-- Every table carries its own user_id so policies don't need to join out
-- to `trees` to check ownership.

alter table trees enable row level security;
alter table places enable row level security;
alter table individuals enable row level security;
alter table individual_events enable row level security;
alter table families enable row level security;
alter table family_children enable row level security;
alter table curiosities enable row level security;
alter table curiosity_individuals enable row level security;

create policy "Users manage their own trees" on trees
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own places" on places
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own individuals" on individuals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own individual events" on individual_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own families" on families
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own family children" on family_children
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own curiosities" on curiosities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own curiosity individuals" on curiosity_individuals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Storage -----------------------------------------------------------------
-- Uploaded GEDCOM source files, stored at `{user_id}/{filename}`.

insert into storage.buckets (id, name, public)
values ('gedcom-files', 'gedcom-files', false)
on conflict (id) do nothing;

create policy "Users manage their own gedcom files" on storage.objects
  for all
  using (bucket_id = 'gedcom-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'gedcom-files' and (storage.foldername(name))[1] = auth.uid()::text);
