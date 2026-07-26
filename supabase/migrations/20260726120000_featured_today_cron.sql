-- Featured Today (docs/phone-ia-design-brief.md, decision 6): the phone
-- Home hero is record-grounded and cached — produced by a daily job, never
-- a live call. This schedules the featured-today Edge Function, which
-- walks all trees and warms the digest notes the client's hero pick will
-- read. 05:00 UTC = midnight US Eastern, well before any morning open.

select cron.schedule(
  'featured-today-warmer',
  '0 5 * * *',
  $$
  select net.http_post(
    url := 'https://bdjsahbjptpcmouqozvs.supabase.co/functions/v1/featured-today',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkanNhaGJqcHRwY21vdXFvenZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDIzODksImV4cCI6MjA5ODUxODM4OX0.9R2xtDg0TYRIs1HRhymt_hf6Npwq6lkTfGCAJVcZy5Q'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
