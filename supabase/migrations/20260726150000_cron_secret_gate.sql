-- Cron workers gated behind a shared secret (2026-07-26 audit): the
-- functions gateway accepts the PUBLIC anon key, so send-digest-emails
-- (force-resend spam + email disclosure), nara-enrich (mutex bypass
-- against a paid quota), featured-today (Anthropic spend), and
-- geocode-pending were all anonymously invocable. Every worker now
-- requires an x-cron-secret header (_shared/cron.ts). The value lives in
-- Vault as 'cron_secret' (never in this file) and MUST match the
-- CRON_SECRET function secret (supabase secrets set CRON_SECRET=...).
-- On a fresh environment this bootstraps a random value - set the
-- function secret to match (select decrypted_secret from
-- vault.decrypted_secrets where name = 'cron_secret').

select case when exists (select 1 from vault.secrets where name = 'cron_secret')
  then 'exists' else vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'cron_secret')::text end;

select cron.schedule('geocode-pending-worker', '* * * * *', $job$
  delete from geocode_ticks where created_at < now() - interval '1 day';
  select net.http_post(
    url := 'https://bdjsahbjptpcmouqozvs.supabase.co/functions/v1/geocode-pending',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkanNhaGJqcHRwY21vdXFvenZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDIzODksImV4cCI6MjA5ODUxODM4OX0.9R2xtDg0TYRIs1HRhymt_hf6Npwq6lkTfGCAJVcZy5Q',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$job$);

select cron.schedule('nara-enrich-worker', '*/10 * * * *', $job$
  delete from nara_ticks where created_at < now() - interval '1 day';
  select net.http_post(
    url := 'https://bdjsahbjptpcmouqozvs.supabase.co/functions/v1/nara-enrich',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkanNhaGJqcHRwY21vdXFvenZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDIzODksImV4cCI6MjA5ODUxODM4OX0.9R2xtDg0TYRIs1HRhymt_hf6Npwq6lkTfGCAJVcZy5Q',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$job$);

select cron.schedule('send-digest-emails', '0 13 * * 0', $job$
  select net.http_post(
    url := 'https://bdjsahbjptpcmouqozvs.supabase.co/functions/v1/send-digest-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkanNhaGJqcHRwY21vdXFvenZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDIzODksImV4cCI6MjA5ODUxODM4OX0.9R2xtDg0TYRIs1HRhymt_hf6Npwq6lkTfGCAJVcZy5Q',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$job$);

select cron.schedule('featured-today-warmer', '0 5 * * *', $job$
  select net.http_post(
    url := 'https://bdjsahbjptpcmouqozvs.supabase.co/functions/v1/featured-today',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkanNhaGJqcHRwY21vdXFvenZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDIzODksImV4cCI6MjA5ODUxODM4OX0.9R2xtDg0TYRIs1HRhymt_hf6Npwq6lkTfGCAJVcZy5Q',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$job$);
