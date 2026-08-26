-- Sanborn edition cache: one row per (city, state), holding the LOC
-- Sanborn Maps collection's editions for that town. The cache is global,
-- not per-tree — Rumford's map editions are the same for every user, and
-- the collection changes rarely, so a row stays fresh for months. Writes
-- go through the sanborn-lookup edge function (service role) only; LOC's
-- 20-requests/minute etiquette is the whole reason this table exists.

create table sanborn_place_cache (
  place_key text primary key, -- normalized 'city|state', e.g. 'rumford|maine'
  city text not null,
  state text not null,
  -- [{ item_id, item_url, title, place, date, year, sheets, thumb }]
  editions jsonb not null default '[]'::jsonb,
  edition_count int not null default 0,
  fetched_at timestamptz not null default now()
);

alter table sanborn_place_cache enable row level security;

create policy "authenticated users read the sanborn cache"
  on sanborn_place_cache for select to authenticated using (true);
