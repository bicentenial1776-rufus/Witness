-- Family sharing, phase 1: the server ground (design:
-- docs/family-sharing-design-brief.md, all decisions Rufus 2026-08-30).
--
-- One subscriber's curated tree, readable by up to four invited family
-- members — read-only companions with their own home person. The whole
-- phase is additive: every existing `auth.uid() = user_id` policy stays
-- exactly as it was, including every write policy. Companions gain
-- SELECT-only policies on the READING tables; the work surfaces
-- (tree_health_marks, tree_health_rulings, nara_candidates, corrections,
-- ancestor_notes, grave_captures, curiosities, research_briefs) get no
-- member policy at all — hidden is enforced here, not just in the UI.
--
-- Seats ride RevenueCat promotional entitlements (granted by the
-- accept-invite edge function, revoked by remove-member and the
-- reconcile-seats cron worker), so every existing entitlement gate —
-- client and server — works unchanged.

-- ---------------------------------------------------------------------
-- Membership. The owner stays trees.user_id — ownership is not a role.
-- `role` is check-constrained to the single v1 value so a v2
-- "contributor" is an alter, not a rethink. `display_name` is captured
-- at accept time because profiles carries no name and shouldn't grow one
-- for this. `rc_granted` records whether the seat came with a
-- promotional entitlement (false when the member was already entitled on
-- their own — a comp or their own subscription) so removal never revokes
-- an entitlement the seat didn't create.

create table tree_members (
  tree_id        uuid not null references trees (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  role           text not null default 'companion' check (role = 'companion'),
  home_person_id uuid references individuals (id) on delete set null,
  display_name   text,
  rc_granted     boolean not null default false,
  invited_by     uuid not null references auth.users (id) on delete cascade,
  joined_at      timestamptz not null default now(),
  primary key (tree_id, user_id)
);

create index tree_members_user_idx on tree_members (user_id);

alter table tree_members enable row level security;

-- ---------------------------------------------------------------------
-- Helpers. member_tree_ids() is the policy predicate everywhere below:
-- STABLE so the planner evaluates it once per query (an init-plan, not a
-- per-row probe), SECURITY DEFINER so policies on other tables can read
-- tree_members without recursing into its own policies.

create or replace function member_tree_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tree_id from tree_members where user_id = auth.uid()
$$;

create or replace function is_tree_owner(p_tree_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from trees where id = p_tree_id and user_id = auth.uid())
$$;

-- Members see their own memberships; the owner sees the roster for
-- trees they own. Writes are the edge functions' job (service role):
-- inserting a member must grant the RevenueCat seat and deleting one
-- must revoke it, and neither half may happen without the other — so
-- the authenticated role cannot do either directly. The one client
-- write allowed is a member updating their own seat's home person and
-- display name, restricted to those columns by grant.
create policy "Members and owners read memberships" on tree_members
  for select using (auth.uid() = user_id or is_tree_owner(tree_id));

create policy "Members update their own seat" on tree_members
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      home_person_id is null
      or home_person_id in
        (select id from individuals where individuals.tree_id = tree_members.tree_id)
    )
  );

revoke insert, update, delete on tree_members from anon, authenticated;
grant update (home_person_id, display_name) on tree_members to authenticated;

-- ---------------------------------------------------------------------
-- Invites. Single-use, 7-day, revocable, owner-only visible — the
-- share_links posture (no anon select ever; the public reads through
-- get_invite below, keyed on an unguessable 128-bit token). Token is 32
-- hex chars generated client-side via expo-crypto, same as share links.

create table invites (
  token       text primary key,
  tree_id     uuid not null references trees (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  revoked_at  timestamptz
);

create index invites_user_idx on invites (user_id, created_at desc);

alter table invites enable row level security;

-- The owner creates, lists, and revokes invites for trees they own.
-- accepted_by/accepted_at are stamped by the accept-invite function
-- (service role), never by the client.
create policy "Owners manage their own invites" on invites
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id and is_tree_owner(tree_id));

-- The /join page's pre-auth peek: who is inviting, into what, and is the
-- link still good. Never exposes ids; the name shown is the tree's name
-- plus the inviter's first name, derived the same way share links do it
-- (home person's first name token).
create or replace function get_invite(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'treeName', t.name,
    'inviterName', split_part(coalesce(hp.full_name, ''), ' ', 1),
    'individualCount', t.individual_count
  )
  from invites i
  join trees t on t.id = i.tree_id
  left join individuals hp on hp.id = t.home_person_id
  where i.token = p_token
    and i.revoked_at is null
    and i.accepted_at is null
    and i.expires_at > now()
$$;

-- ---------------------------------------------------------------------
-- The companion's read. One additional PERMISSIVE select policy per
-- reading table; the existing owner policies are untouched. The list is
-- the reading experience plus confirmed facts (Rufus 2026-08-30:
-- "confirmed facts only" — crossings, graves, and archive matches are
-- the curated product; notes, open verdicts, and the workbench are not).
--
-- IMPORTANT for every future feature: RLS is per-user-OR-membership, not
-- per-tree. A client select on these tables without an explicit tree_id
-- (or specific-row id) filter now mixes ANOTHER member's tree into the
-- results, not just the user's own trees. Filter, always.

create policy "Members read shared trees" on trees
  for select using (id in (select member_tree_ids()));

create policy "Members read shared places" on places
  for select using (tree_id in (select member_tree_ids()));

create policy "Members read shared individuals" on individuals
  for select using (tree_id in (select member_tree_ids()));

create policy "Members read shared events" on individual_events
  for select using (tree_id in (select member_tree_ids()));

create policy "Members read shared families" on families
  for select using (tree_id in (select member_tree_ids()));

-- family_children carries no tree_id (its scope is the family row), so
-- membership reaches it through families — whose own member policy makes
-- the subquery resolve for a companion.
create policy "Members read shared family children" on family_children
  for select using (
    family_id in (select id from families where tree_id in (select member_tree_ids()))
  );

create policy "Members read shared sources" on sources
  for select using (tree_id in (select member_tree_ids()));

create policy "Members read shared citations" on citations
  for select using (tree_id in (select member_tree_ids()));

create policy "Members read shared story arcs" on story_arcs
  for select using (tree_id in (select member_tree_ids()));

create policy "Members read shared tree syntheses" on tree_syntheses
  for select using (tree_id in (select member_tree_ids()));

create policy "Members read shared enrichment" on enrichment_cache
  for select using (tree_id in (select member_tree_ids()));

create policy "Members read shared findings" on findings
  for select using (tree_id in (select member_tree_ids()));

create policy "Members read shared grave confirmations" on grave_confirmations
  for select using (tree_id in (select member_tree_ids()));

-- Relationships need no member policy: each member's rows are computed
-- from their own home person and carry their own user_id, so the
-- existing owner policy already covers them. compute-relationships
-- learns about membership in its own change.

-- ---------------------------------------------------------------------
-- Seat reconciliation, daily at 06:10 UTC (after the featured-today
-- warmer). The worker re-checks every seat-granting owner's entitlement:
-- lapsed plan → revoke seat entitlements and delete the membership rows
-- (Rufus 2026-08-30: no grace period — RevenueCat's own billing-retry
-- window is the grace); active plan → refresh any seat grant nearing
-- expiry. Same x-cron-secret gate as every other worker.

select cron.schedule('reconcile-seats', '10 6 * * *', $job$
  select net.http_post(
    url := 'https://bdjsahbjptpcmouqozvs.supabase.co/functions/v1/reconcile-seats',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkanNhaGJqcHRwY21vdXFvenZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDIzODksImV4cCI6MjA5ODUxODM4OX0.9R2xtDg0TYRIs1HRhymt_hf6Npwq6lkTfGCAJVcZy5Q',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$job$);
