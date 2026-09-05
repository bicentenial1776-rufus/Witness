-- GEDCOM media metadata and attachment graph.
-- Bytes are uploaded separately by the desktop media worker; this migration
-- records what the GEDCOM says exists and where each object is attached.

insert into storage.buckets (id, name, public)
values ('tree-media', 'tree-media', false)
on conflict (id) do nothing;

create table media (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  gedcom_xref text not null,
  file_path text,
  title text,
  format text,
  storage_path text,
  byte_size bigint,
  content_hash text,
  upload_status text not null default 'pending',
  unique (tree_id, gedcom_xref)
);

create table media_links (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  media_id uuid not null references media (id) on delete cascade,
  individual_id uuid references individuals (id) on delete cascade,
  family_id uuid references families (id) on delete cascade,
  individual_event_id uuid references individual_events (id) on delete cascade,
  citation_id uuid references citations (id) on delete cascade,
  is_primary boolean not null default false,
  constraint media_links_one_subject check (
    ((individual_id is not null)::integer +
     (family_id is not null)::integer +
     (individual_event_id is not null)::integer +
     (citation_id is not null)::integer) = 1
  )
);

create index media_tree_id_idx on media (tree_id);
create index media_links_tree_id_idx on media_links (tree_id);
create index media_links_media_id_idx on media_links (media_id);
create index media_links_individual_id_idx on media_links (individual_id);
create index media_links_family_id_idx on media_links (family_id);
create index media_links_event_id_idx on media_links (individual_event_id);
create index media_links_citation_id_idx on media_links (citation_id);

alter table media enable row level security;
alter table media_links enable row level security;

create policy "Users manage their own media" on media
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id and is_tree_owner(tree_id));

create policy "Users manage their own media links" on media_links
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id and is_tree_owner(tree_id));

create policy "Users manage their own tree media files" on storage.objects
  for all using (
    bucket_id = 'tree-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'tree-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
