-- Reading the media (docs/media-reading-design-brief.md): what a file in
-- the tree SAYS — a transcript, a summary, the names and dates it
-- mentions — read once per file by content hash. A reading is evidence,
-- never a fact: it lives here with its model, prompt version, and
-- confidence, and never writes into a person's record. The reader
-- confirms or rejects, the At the Stone pattern.

create table media_readings (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references media (id) on delete cascade,
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  content_hash text,
  kind text not null
    check (kind in ('portrait', 'group', 'house', 'headstone', 'document', 'letter', 'clipping', 'record', 'map', 'other')),
  /** One line in plain words, for every kind: "a studio portrait of a young woman, c. 1900". */
  description text,
  /** Verbatim text where the file carries any; [illegible] where it does not. */
  transcript text,
  summary text,
  /** [{ kind: 'name' | 'date' | 'place', text }] as the reader found them. */
  mentions jsonb not null default '[]'::jsonb,
  confidence text not null default 'medium' check (confidence in ('high', 'medium', 'low')),
  status text not null default 'read'
    check (status in ('read', 'confirmed', 'rejected', 'failed')),
  failure text,
  model text,
  prompt_version text,
  read_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (media_id)
);

create index media_readings_tree_idx on media_readings (tree_id);
create index media_readings_hash_idx on media_readings (content_hash);

alter table media_readings enable row level security;

-- The owner reads, confirms, and rejects; the worker (service role) writes.
create policy "Owners manage their media readings" on media_readings
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id and is_tree_owner(tree_id));

create policy "Members read shared media readings" on media_readings
  for select using (tree_id in (select member_tree_ids()));

-- The read-media worker on a schedule: every ten minutes, a small batch
-- of complete uploads that have no reading yet. The queue is the absence
-- of a reading, so a refresh or a new overlay is read on the next tick
-- and nothing is ever read twice. Same cron-secret gate as the others.
select cron.schedule(
  'read-media-worker',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://bdjsahbjptpcmouqozvs.supabase.co/functions/v1/read-media',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkanNhaGJqcHRwY21vdXFvenZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDIzODksImV4cCI6MjA5ODUxODM4OX0.9R2xtDg0TYRIs1HRhymt_hf6Npwq6lkTfGCAJVcZy5Q',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"limit": 8}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
