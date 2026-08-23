-- The pencil in the margin (Katie review, the round-trip arc's deferred
-- piece). Witness is deliberately read-only: the master tree lives on
-- Ancestry, fixes happen there, and return via the GEDCOM refresh. But the
-- moment a researcher SPOTS the error is rarely the moment they are sitting
-- at Ancestry — a correction is their own annotation beside a fact, written
-- when they see it, carried on the punch list and its worksheet export back
-- to the source. It NEVER changes the displayed record; like an ancestor
-- note, only its author sees it.
--
-- subject is a stable fact key ('birth', 'event:census:1900'), never an
-- individual_events id — event rows are reassigned on every import.
-- current_value is the display snapshot of what the record said at
-- authoring time; snapshot_key is the canonical year-level form (name/
-- birth/death only) the refresh compares against the new file to say,
-- honestly, "the file may have adopted this — review it". Rows are
-- tree-scoped like research_briefs and move across a refresh by the same
-- three-tier remap (unlike ancestor_notes, which today die silently).
--
-- No unique constraint: several corrections per person are legitimate
-- ('other' may repeat), and the authoring UI edits the existing open row
-- when the picked subject already has one.

create table corrections (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals (id) on delete cascade,
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null check (char_length(subject) <= 64),
  current_value text check (char_length(current_value) <= 1000),
  snapshot_key text check (char_length(snapshot_key) <= 300),
  corrected_value text not null check (char_length(corrected_value) between 1 and 1000),
  note text check (char_length(note) <= 2000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index corrections_individual_idx on corrections (individual_id);
create index corrections_tree_idx on corrections (tree_id);

alter table corrections enable row level security;

create policy "Users manage their own corrections" on corrections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
