-- Find a Grave deep-link & confirm (Rufus's spec, 2026-08-24). Imported
-- citations carry memorial URLs, but they are Ancestry's claims — some are
-- attached to the wrong person. This table holds the URL the user
-- PERSONALLY confirmed in their own browser session: researcher testimony,
-- like corrections and notes, so it lives beside the record (never on the
-- replaceable individuals rows) and carries across refreshes with the
-- other authored work. Witness never fetches findagrave.com itself — the
-- only network contact is the user's own in-app browser.

create table grave_confirmations (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals (id) on delete cascade,
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null check (char_length(url) <= 2000),
  confirmed_at timestamptz not null default now(),
  unique (user_id, individual_id)
);

create index grave_confirmations_individual_idx on grave_confirmations (individual_id);
create index grave_confirmations_tree_idx on grave_confirmations (tree_id);

alter table grave_confirmations enable row level security;

create policy "Users manage their own grave confirmations" on grave_confirmations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
