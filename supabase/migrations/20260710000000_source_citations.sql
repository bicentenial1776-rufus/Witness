-- Source records and citations: the "how do we know this?" layer of the
-- GEDCOM. Sources are the bibliography (published town histories, census
-- databases, vital-record collections); citations tie a source to a
-- specific person or family fact, with a page locator, an excerpt of the
-- record text, and Ancestry's _APID for deep links back to the record.

create table sources (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  gedcom_xref text not null,
  title text,
  author text,
  publisher text,
  ancestry_apid text,
  unique (tree_id, gedcom_xref)
);

create table citations (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid not null references sources (id) on delete cascade,
  -- Exactly one of individual_id / family_id is set (enforced below).
  individual_id uuid references individuals (id) on delete cascade,
  family_id uuid references families (id) on delete cascade,
  -- Which fact the citation supports: person, name, birth, residence,
  -- marriage, … Free text, not an enum: exports invent fact tags freely
  -- and an unknown fact label is still a perfectly good citation.
  fact text not null,
  page text,
  text_excerpt text,
  url text,
  ancestry_apid text,
  constraint citations_one_subject check (
    (individual_id is not null) <> (family_id is not null)
  )
);

create index sources_tree_id_idx on sources (tree_id);
create index citations_tree_id_idx on citations (tree_id);
create index citations_source_id_idx on citations (source_id);
create index citations_individual_id_idx on citations (individual_id);
create index citations_family_id_idx on citations (family_id);

alter table sources enable row level security;
alter table citations enable row level security;

create policy "Users manage their own sources" on sources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own citations" on citations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
