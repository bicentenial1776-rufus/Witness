-- Per-user profile data outside the GEDCOM tree itself: onboarding
-- completion, so the transformation-narrative flow shows exactly once
-- per account (not per device, not per reinstall).

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users manage their own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create the row at signup so the client can always assume a
-- profile exists rather than upserting on first read.
create function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Accounts that signed up before this table existed also need a row,
-- or markOnboardingComplete's UPDATE matches nothing and silently no-ops.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
