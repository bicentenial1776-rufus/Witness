-- "This Week in Your Family" as email (WEB_APP_DESIGN.md §5): the web and
-- iPad answer to the native local notification. Opt-in lives server-side on
-- the profile (the native toggle stays device-local; this one follows the
-- account), and the weekly send is a pg_cron-driven Edge Function using the
-- same Resend sender that already delivers auth mail.

alter table profiles
  add column digest_email_enabled boolean not null default false,
  add column digest_email_last_sent_at timestamptz;

-- Sundays 13:00 UTC ≈ morning across US time zones — the audience the
-- weekly digest addresses. Per-user timezone sends are a later refinement.
select cron.schedule(
  'send-digest-emails',
  '0 13 * * 0',
  $$
  select net.http_post(
    url := 'https://bdjsahbjptpcmouqozvs.supabase.co/functions/v1/send-digest-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkanNhaGJqcHRwY21vdXFvenZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDIzODksImV4cCI6MjA5ODUxODM4OX0.9R2xtDg0TYRIs1HRhymt_hf6Npwq6lkTfGCAJVcZy5Q'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
