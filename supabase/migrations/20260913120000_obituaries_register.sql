-- Obituaries and death notices — the `obituaries` register, worker-fed
-- from Chronicling America by the obituary-leads edge function (the
-- va-burials shape). The queue function gains an upper death-year bound
-- (Chronicling America ends in 1963); the old four-argument signature is
-- replaced, and va-enrich's named-argument call resolves to the new one
-- through the default.

drop function if exists register_enrichment_queue(text, integer, integer, uuid);
create or replace function register_enrichment_queue(
  p_register_key text,
  p_limit integer,
  p_min_death_year integer,
  p_tree_id uuid default null,
  p_max_death_year integer default null
)
returns table (
  id uuid,
  tree_id uuid,
  user_id uuid,
  full_name text,
  given_name text,
  surname text,
  sex sex_type,
  birth_year integer,
  death_year integer
)
language sql
stable
set search_path = public
as $$
  select i.id, i.tree_id, i.user_id, i.full_name, i.given_name, i.surname, i.sex,
         i.birth_year, i.death_year
  from individuals i
  join trees t on t.id = i.tree_id
  left join register_enrichment_state s
    on s.register_key = p_register_key and s.individual_id = i.id
  where s.individual_id is null
    and not i.living
    and i.death_year is not null
    and i.death_year >= p_min_death_year
    and (p_max_death_year is null or i.death_year <= p_max_death_year)
    and i.full_name is not null and i.full_name <> ''
    and (p_tree_id is null or i.tree_id = p_tree_id)
  order by t.imported_at asc, i.id
  limit p_limit;
$$;
revoke execute on function register_enrichment_queue(text, integer, integer, uuid, integer) from public;
revoke execute on function register_enrichment_queue(text, integer, integer, uuid, integer) from anon;
revoke execute on function register_enrichment_queue(text, integer, integer, uuid, integer) from authenticated;
grant execute on function register_enrichment_queue(text, integer, integer, uuid, integer) to service_role;

-- The catalog row, the same content as data/registers/obituaries/register.json.
insert into registers (register_key, display_name, variant, provenance_label, coverage_caveat, status, config)
values (
  'obituaries',
  'Obituaries and death notices (Chronicling America)',
  'C',
  'From a newspaper notice (Chronicling America, Library of Congress)',
  'Chronicling America holds American newspapers of 1756–1963, thickest from the 1830s to the 1920s and uneven by state — many towns had no digitized paper. The text is machine-read from scans and often garbled; the excerpt is the record, and the reading beneath it is Witness’s, not the paper’s. A relative the notice names and your tree lacks is a lead, not a fact.',
  'active',
  $json$
  {
    "worker": {
      "source": "https://www.loc.gov/collections/chronicling-america/",
      "minDeathYear": 1836,
      "maxDeathYear": 1963,
      "note": "Fed by the obituary-leads edge function: a name search in the person's state around the death year, the page OCR, a passage where the surname sits beside the words of a notice, and a model reading of that passage (claude-sonnet-4-6, strictly from the text). Scored in packages/core/src/registers/obituaries.ts."
    },
    "deepLinkTemplate": "https://www.loc.gov/collections/chronicling-america/?q={given}+{surname}&dl=page",
    "markerStyle": "notice",
    "explainer": "Chronicling America is the Library of Congress’s free archive of American newspapers, 1756–1963, with every page’s text read by machine. A death or funeral notice is the one public record that names a family in its own words — the widow, the sons and daughters, the town, the church. Witness searches the person’s name in their state around the year of death, reads the pages where the name sits beside the words of a notice, and shows you the passage with what it seems to say. You decide whether it is them; a relative it names that your tree does not hold is a lead to research, never something Witness writes for you."
  }
  $json$::jsonb
)
on conflict (register_key) do update
  set display_name = excluded.display_name,
      variant = excluded.variant,
      provenance_label = excluded.provenance_label,
      coverage_caveat = excluded.coverage_caveat,
      status = excluded.status,
      config = excluded.config;

-- Every ten minutes on the :02 offsets — its own minute so it never
-- shares a tick with nara-enrich (:00) or va-enrich (:05), and loc.gov
-- sees one Witness worker at a time.
select cron.schedule(
  'obituary-leads-worker',
  '2,12,22,32,42,52 * * * *',
  $$
  select net.http_post(
    url := 'https://bdjsahbjptpcmouqozvs.supabase.co/functions/v1/obituary-leads',
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
