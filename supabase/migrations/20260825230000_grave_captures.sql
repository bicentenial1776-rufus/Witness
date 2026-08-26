-- At the Stone (docs: design artifact 2026-08-25): headstone captures.
-- A capture is one stone from one cemetery visit — its photos, where the
-- reader stood, what the vision pass read off it, and what became of it.
-- Photos live in the PRIVATE grave-photos bucket under {user_id}/...;
-- the read-headstone edge function does the transcription and matching.

create table grave_captures (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- queued → reading → read (candidates ready) → attached | lead | dismissed
  status text not null default 'queued'
    check (status in ('queued', 'reading', 'read', 'attached', 'lead', 'dismissed', 'failed')),
  photo_paths text[] not null default '{}',
  latitude double precision,
  longitude double precision,
  heading double precision,
  accuracy_m double precision,
  captured_at timestamptz not null default now(),
  -- Reverse-geocoded at read time: "Cemetery on US 2 · Rumford, Oxford County, Maine"
  cemetery text,
  -- The stone's inscription, verbatim — this is the record.
  transcription text,
  -- Derived facts (name, dates, Æ arithmetic, relationship phrases) — all
  -- marked as computed in the app, never presented as carved.
  divined jsonb,
  -- Scored match candidates against the tree, with reasons.
  candidates jsonb,
  matched_individual_id uuid references individuals(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table grave_captures enable row level security;

create policy "own captures" on grave_captures
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index grave_captures_tree_status_idx on grave_captures (tree_id, status);
create index grave_captures_matched_idx on grave_captures (matched_individual_id)
  where matched_individual_id is not null;

-- Private photo storage: each user reads and writes only their own folder.
create policy "grave photos read own" on storage.objects
  for select using (bucket_id = 'grave-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "grave photos insert own" on storage.objects
  for insert with check (bucket_id = 'grave-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "grave photos delete own" on storage.objects
  for delete using (bucket_id = 'grave-photos' and (storage.foldername(name))[1] = auth.uid()::text);
