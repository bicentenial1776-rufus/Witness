-- FSV keepsakes (Greg's list of 2026-09-19; docs/FSV_KEEPSAKES_SEAM.md).
--
-- A room's keepsakes that the family file cannot fill — the news of its
-- day and place, pictures and maps of the place, deeds and papers — come
-- from the fsv-keepsakes edge function, in the enrichment pattern the
-- Sanborn lookup set: cached by (kind, place, decade), never by user, so
-- every household in the same town and decade shares one find and the
-- sources are asked once. The function is the only writer.
create table if not exists public.fsv_keepsake_cache (
  kind       text not null check (kind in ('news', 'place', 'papers')),
  -- 'town|state' (US) or 'town|country', lowercased, the way the household record spells them.
  place_key  text not null,
  decade     int  not null,
  -- [{ title, date, image, thumb, url, provider, note }]
  items      jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  primary key (kind, place_key, decade)
);
alter table public.fsv_keepsake_cache enable row level security;
drop policy if exists "fsv keepsake cache: signed-in users read" on public.fsv_keepsake_cache;
create policy "fsv keepsake cache: signed-in users read"
  on public.fsv_keepsake_cache for select to authenticated using (true);

-- One outbound call every two seconds per host, across every running
-- copy of the function: a call claims its two-second slot here first
-- (insert; a conflict means another copy has it, wait for the next).
-- Rows expire in a day; the function deletes old ones as it goes.
create table if not exists public.fsv_source_ticks (
  host       text   not null,
  slot       bigint not null,
  created_at timestamptz not null default now(),
  primary key (host, slot)
);
alter table public.fsv_source_ticks enable row level security;
-- No policies: service role only, like geocode_ticks and register_ticks.
