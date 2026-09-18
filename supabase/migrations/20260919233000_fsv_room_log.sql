-- WHAT HAPPENED WHEN A ROOM WAS OPENED: the rooms' own report from the device.
--
-- The app has no crash or error reporting (nothing named Sentry, Crashlytics
-- or expo-updates anywhere, 19 September 2026), and Family Street View does
-- not wait for one. Each time a door is opened the room screen writes one row
-- here: opened, or why not (no room in the world for that household; nothing
-- reported within twenty seconds, which is a black panel; or an error the
-- panel caught). One row per opening, written once, after the fact; nothing
-- the room does depends on the write succeeding.
--
-- A user may write their own rows and read none. Reading is for the dashboard.
-- Nobody's family is in here: a family's key is an id in a tree only that
-- user's device can resolve.

create table if not exists public.fsv_room_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  family_key text not null,
  outcome text not null check (outcome in ('opened', 'no-room', 'timed-out', 'failed')),
  ms integer not null,
  note text
);

alter table public.fsv_room_log enable row level security;

drop policy if exists "fsv_room_log: a user may write their own rows" on public.fsv_room_log;
create policy "fsv_room_log: a user may write their own rows"
  on public.fsv_room_log for insert
  with check (auth.uid() = user_id);

comment on table public.fsv_room_log is
  'Family Street View phase 1: one row per room opened, with the outcome. The error report for the rooms. See docs/FSV_PHASE1_DARK.md.';
