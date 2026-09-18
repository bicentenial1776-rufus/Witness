-- THE EARLY-ACCESS LIST FOR FAMILY STREET VIEW'S ROOMS — and the kill switch.
--
-- Phase 1 of Family Street View goes into the app dark (docs/FSV_PHASE1_DARK.md).
-- A door opens for a user only when the build flag is on, the user holds an
-- active seat, AND the user has a row here. Deleting the rows closes every
-- door for everyone at once, with no release: that is the point of the table.
--
-- Nothing is written here by the app. Rows are added by hand (the two
-- internal testers first), then by whatever opt-in the early-access
-- programme settles on. A user can read whether they are on the list and
-- nothing else.

create table if not exists public.fsv_early_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  note text
);

alter table public.fsv_early_access enable row level security;

drop policy if exists "fsv_early_access: a user may see their own row" on public.fsv_early_access;
create policy "fsv_early_access: a user may see their own row"
  on public.fsv_early_access for select
  using (auth.uid() = user_id);

comment on table public.fsv_early_access is
  'Family Street View phase 1: users who may open a room. Empty table = every door shut. See docs/FSV_PHASE1_DARK.md.';
