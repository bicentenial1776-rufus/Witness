-- Tree Health findings and Orphan Records, computed once per import by a
-- worker (packages/core/scripts/precompute-audit.mts, scheduled by
-- .github/workflows/precompute-audit.yml) instead of by every browser
-- session. On a 61,773-person tree the session-side audit was ~35 paged
-- requests and 26 s on the Micro instance (2026-09-17); the precomputed
-- rows are one small read. The client-side computation stays as the
-- fallback while a tree's audit is pending.
--
-- Marks (tree_health_marks) and rulings (tree_health_rulings) keep filtering
-- at read time, so finding_key / xref_key are stored exactly as the app
-- derives them today.

alter table public.trees
  add column if not exists audit_computed_at timestamptz,
  add column if not exists audit_summary jsonb;

create table if not exists public.tree_health_findings (
  id             uuid primary key default gen_random_uuid(),
  tree_id        uuid not null references public.trees (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  check_id       text not null,
  severity       text not null,
  individual_ids uuid[] not null,
  family_id      uuid,
  detail         text not null,
  finding_key    text not null,
  xref_key       text not null,
  legacy_xref_key text not null,
  primary_surname text,
  computed_at    timestamptz not null default now(),
  unique (tree_id, finding_key)
);
create index if not exists tree_health_findings_tree_id_idx on public.tree_health_findings (tree_id);

create table if not exists public.orphan_records (
  id                 uuid primary key default gen_random_uuid(),
  tree_id            uuid not null references public.trees (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  kind               text not null check (kind in ('island', 'solo')),
  -- The island's anchor, or the solo record itself.
  primary_id         uuid not null,
  member_ids         uuid[] not null,
  deletion_candidate boolean not null default false,
  suggestion         jsonb,
  computed_at        timestamptz not null default now(),
  unique (tree_id, primary_id)
);
create index if not exists orphan_records_tree_id_idx on public.orphan_records (tree_id);

alter table public.tree_health_findings enable row level security;
alter table public.orphan_records enable row level security;

-- Read like the other reading tables: the owner, or a member of a shared tree.
-- No insert/update/delete policies: only the service role writes these.
drop policy if exists "Users select their own or shared tree health findings" on public.tree_health_findings;
create policy "Users select their own or shared tree health findings"
  on public.tree_health_findings for select
  using ((select auth.uid()) = user_id or tree_id in (select member_tree_ids()));

drop policy if exists "Users select their own or shared orphan records" on public.orphan_records;
create policy "Users select their own or shared orphan records"
  on public.orphan_records for select
  using ((select auth.uid()) = user_id or tree_id in (select member_tree_ids()));
