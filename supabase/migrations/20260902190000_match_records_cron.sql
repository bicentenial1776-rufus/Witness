-- The match-records worker on a schedule: every six hours, sweep the
-- most recent trees so record matching is self-serving — a family
-- member's tree gets its candidates without anyone running a CLI, and
-- library growth reaches existing trees. Imports also invoke the worker
-- directly (caller-JWT door), so the cron is the backstop, not the
-- primary path. Secret rides from Vault, the cron_secret_gate pattern.
select cron.schedule(
  'match-records-worker',
  '15 */6 * * *',
  $$
  select net.http_post(
    url := 'https://bdjsahbjptpcmouqozvs.supabase.co/functions/v1/match-records',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkanNhaGJqcHRwY21vdXFvenZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDIzODksImV4cCI6MjA5ODUxODM4OX0.9R2xtDg0TYRIs1HRhymt_hf6Npwq6lkTfGCAJVcZy5Q',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
