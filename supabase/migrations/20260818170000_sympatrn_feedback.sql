-- The Sympatrn beta feedback channel (a tenant, not a Witness feature).
-- Sympatrn has no server of its own — its record lives on-device, and
-- the only thing its beta syncs is the confusion marker: where the
-- conversation broke and the person's stated reason. The free tier's
-- two-project cap put the table here (Rufus's call, 2026-08-18); it
-- lives in its own schema, deliberately NOT exposed through PostgREST —
-- the sympatrn-feedback edge function reaches it over SUPABASE_DB_URL,
-- so Witness's API surface is untouched.
create schema if not exists sympatrn;

create table sympatrn.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  -- The pseudonym: a random id minted on the device, tied to no
  -- account. Revocation deletes by it.
  device_id text not null check (char_length(device_id) <= 64),
  -- Per-row id minted by the client, so a retried batch upserts
  -- instead of double-counting.
  client_id uuid not null,
  created_at timestamptz not null,
  received_at timestamptz not null default now(),
  question_kind text,
  question_text text,
  category text,
  detail text,
  chips_shown text,
  typed_text text,
  reason text,
  app_version text,
  unique (device_id, client_id)
);

-- RLS on with no policies: nothing reaches this table except the edge
-- function's direct connection (service credentials, which bypass RLS).
alter table sympatrn.feedback_reports enable row level security;

create index feedback_reports_device_idx on sympatrn.feedback_reports (device_id);
create index feedback_reports_kind_idx on sympatrn.feedback_reports (question_kind);
