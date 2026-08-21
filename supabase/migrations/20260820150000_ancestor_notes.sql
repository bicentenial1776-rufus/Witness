-- The annotation box (Betsey's ask, 2026-08-19): "just a box below to
-- add what I have documented or just heard from family lore." One
-- editable note per ancestor per user — the person's own words, kept
-- WITH the ancestor, not with the story: stories are regenerable
-- derivatives (prompt_version bumps retire them wholesale) and the note
-- must survive every retelling. Deliberately never fed to the story
-- writer (decided 2026-08-20): the story stays documented-facts-only,
-- and the note renders alongside as the person's own voice.

create table ancestor_notes (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals (id) on delete cascade,
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null check (char_length(content) <= 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, individual_id)
);

create index ancestor_notes_individual_idx on ancestor_notes (individual_id);

alter table ancestor_notes enable row level security;

create policy "Users manage their own ancestor notes" on ancestor_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
