-- Phase 3: Research Brief Generator. One row per generated brief; the user
-- owns the status lifecycle (open → in progress → resolved / archived),
-- the service role owns creation. Rows count against the same daily AI
-- budget as enrichment_cache.

create type research_brief_status as enum ('open', 'in_progress', 'resolved', 'archived');

create table research_briefs (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals (id) on delete cascade,
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status research_brief_status not null default 'open',
  title text not null,
  content text not null,
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index research_briefs_user_status_idx on research_briefs (user_id, status);
create index research_briefs_user_created_idx on research_briefs (user_id, created_at);

alter table research_briefs enable row level security;

create policy "Users read their own briefs" on research_briefs
  for select using (auth.uid() = user_id);

-- Status changes (and only via the app's own rows); creation stays with
-- the service role so briefs always pass through the generator.
create policy "Users update their own briefs" on research_briefs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users delete their own briefs" on research_briefs
  for delete using (auth.uid() = user_id);
