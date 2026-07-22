-- Drives the geocode-pending edge function once a minute (see
-- supabase/functions/geocode-pending). The tick table gives concurrent
-- invocations a cheap mutual-exclusion primitive: one insert per minute
-- wins; losers exit without touching Nominatim.
--
-- The anon key in the Authorization header only satisfies the edge
-- function's JWT gate; it is the same public key every app build embeds.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists geocode_ticks (
  minute text primary key,
  created_at timestamptz not null default now()
);
-- Service-role only; no user policies. RLS on with no policies denies clients.
alter table geocode_ticks enable row level security;

select cron.schedule(
  'geocode-pending-worker',
  '* * * * *',
  $$
  delete from geocode_ticks where created_at < now() - interval '1 day';
  select net.http_post(
    url := 'https://bdjsahbjptpcmouqozvs.supabase.co/functions/v1/geocode-pending',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkanNhaGJqcHRwY21vdXFvenZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDIzODksImV4cCI6MjA5ODUxODM4OX0.9R2xtDg0TYRIs1HRhymt_hf6Npwq6lkTfGCAJVcZy5Q'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
