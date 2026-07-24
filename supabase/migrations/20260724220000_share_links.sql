-- Public share links (WEB_APP_DESIGN.md §8 Phase B, growth-funnel leg).
-- A share is a SNAPSHOT: the card's content is copied into the row at
-- creation, so the public page reads exactly one row and never touches
-- the live tree tables. Rules decided 2026-07-24: one ancestor's card per
-- link (never a browsable tree), never a living person, revocable by the
-- sharer and expiring after 90 days regardless, attributed to the
-- sharer's first name.

create table share_links (
  token text primary key,
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  individual_id uuid not null references individuals (id) on delete cascade,
  kind text not null default 'ancestor',
  sharer_name text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days',
  revoked_at timestamptz
);

create index share_links_user_idx on share_links (user_id, created_at desc);

alter table share_links enable row level security;

-- The sharer manages their own links (create, list, revoke). No anon
-- select policy at all: the public reads through get_share below, so the
-- table can never be listed or enumerated.
create policy "Users manage their own share links" on share_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Public fetch by exact token. SECURITY DEFINER so the anon role can call
-- it without any select grant on the table; unguessable 128-bit tokens
-- are the lookup key. Returns nothing for revoked or expired links.
create or replace function get_share(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'kind', kind,
    'sharer_name', sharer_name,
    'payload', payload,
    'created_at', created_at
  )
  from share_links
  where token = p_token
    and revoked_at is null
    and expires_at > now()
$$;
