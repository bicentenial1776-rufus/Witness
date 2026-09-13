# Historical Record Registers — the framework

The build spec is `witness-historical-record-registers-package.md` (this
file is the working reference it calls for in Phase 3). A **register** is a
named public-domain record set — the Acadian Deportation rolls, Civil War
regiments, BLM land patents — served through one generic frame: seed or
deep-link → exposure heuristic on GEDCOM facts → user-confirmed link →
narrative + map + research queue.

## The three variants

- **A — curated person table.** Seeded rows matched to tree people
  (soundex + year-plausibility, the Crossing Library's proven core). The
  user confirms or rejects each candidate on the Portrait.
- **B — entity table.** Seeded entities (regiments) with dated, placed
  events; a person links to the entity and its events become unit-level
  facts. (The entity picker arrives with the Civil War register.)
- **C — deep-link + save-back.** No seed: an exposure heuristic opens a
  prefilled external search; the user confirms and Witness saves a
  structured payload (URL + key fields + optional geocode). Shipped
  2026-09-13 with `aad-wwii-enlistment`: exposure is the candidate (the
  Variant B shape, in both matchers), the card offers *Search the file ›*
  / *I found them* / *Not them*, and *I found them* opens the config-driven
  save-back form (`config.saveBack`, rendered by `registers/saveBack.ts`,
  written by `attachRegisterSaveBack` + the confirm event). Deep-link
  templates may use `{given}` `{surname}` `{given_upper}` `{surname_upper}`
  `{birth_year}` `{birth_yy}` `{death_year}`.
- **C, worker-fed** (`va-burials`, 2026-09-13). The same link shape, but
  a server worker fills the payload: the source is too large to seed
  (8.4M rows on data.va.gov) so the `va-enrich` edge function queries it
  live per person on a pg_cron cadence, scores the rows in core
  (`registers/vaBurials.ts`), and inserts candidate links with the record
  snapshot — cemetery, service, coordinates — in `saved_payload`. The
  reader's "This is them" writes the confirm event from the snapshot and
  the geocode puts the cemetery on the Ancestor Map (`pointsFromSavedPayloads`
  → `lib/register-points.ts`). Two generic tables serve every worker-fed
  register: `register_enrichment_state` (who has been examined, per
  register) and `register_ticks` (per-register mutual exclusion), with
  `register_enrichment_queue()` as the service-role queue.

## Invariants (enforced, not aspirational)

- **Provenance:** PD/government sources only in `register_records`; every
  row carries `source_citation`; copyrighted compilations are
  `finding_aid_url` targets only.
- **Curiosities, not verdicts:** links are `candidate` until the user acts;
  the one exception is `parsed_from_gedcom` for facts the GEDCOM already
  holds.
- **Re-import survival:** decided links (anything ≠ candidate) ride the
  pulse carry-forward (`pulse/refresh.ts`) — added the day the table was
  born. Candidates regenerate on the next match run, by design.
- **RLS:** `registers` / `register_records` / `register_record_events` are
  select-only for authenticated users and written by the service role
  (seeds); `person_register_links` is the user's own rows. When a server
  worker starts inserting candidates, split the link policies the way
  `nara_candidates` does.
- **Snapshot cards:** the fields a card renders are denormalized onto the
  link, so a re-seed never breaks a confirmed card (retired records
  `set null` the pointer and nothing else).
- **Silence over guessing:** exposure below threshold returns nothing.

## Where things live

- Pure logic: `packages/core/src/registers/` — `exposure.ts` (config
  scorer), `match.ts` (Variant A), `deeplink.ts`, `narrative.ts`
  (provenance-labeled blocks for the narrative edge functions), `map.ts`,
  `registry.ts` (DB fetch layer), `types.ts` (the `config` JSON's shape).
- Data: `data/registers/<key>/` — `register.json` + `records.csv`
  (+ `events.csv`). Widening a register is a data change + re-seed.
- Scripts: `packages/core/scripts/seed-register.ts` (idempotent,
  service-role) and `match-registers.ts` (exposure + matching + `--write`
  links & strong-candidate findings + `--report`, the acceptance harness).
- UI: `RegisterCandidateCard` (generic; explainer "?" from
  `config.explainer`, coverage caveat, verdicts) rendered in the
  Portrait's "In the record books" section; confirm-event writes via
  `apps/mobile/src/lib/register-links.ts` when `config.confirmEvent` says
  so.
- Findings: strong candidates are noticed with source `'register'`, id
  `register:<key>:<individual>:<record>`.

## Adding a register

1. `data/registers/<key>/register.json` — catalog row: display name,
   variant, provenance label, coverage caveat, and `config` (exposure
   windows/places/threshold, match knobs, deep-link template, optional
   `confirmEvent` and `explainer` — the "?" text is required for any
   register a card renders).
2. `records.csv` for Variant A/B — recognized columns are typed
   (`given`, `surname`, `birth_year`, `death_year`, `event_year`,
   `entity_key`, `source`, `finding_aid_url`); anything else lands in
   `attributes`. Store the raw source text beside the CSV.
3. A normalizer under `registers/normalizers/` only if names genuinely
   need one; per-register tests beside it.
4. `npx tsx scripts/seed-register.ts ../../data/registers/<key>` then
   `npx tsx scripts/match-registers.ts --tree <id> --report` and eyeball,
   then `--write`.
5. **Verify the deep-link template against the live target before the
   register ships.** FamilySearch's parameters verified; the Ellis Island
   Foundation's did not exist; GLO's did not survive BLM's July 2026
   re-platform (a Salesforce shell at `/s/` with no query parameters — see
   the package doc §2.3, rewritten 2026-09-13); LAC is unverified until
   proven.

If a config-only register needs framework code, that is a framework defect
to fix, not a one-off patch.

## Known limits (deliberate, revisit with the named register)

- The harness runs against a live tree; a `--gedcom` mode lands with the
  Acadian acceptance run if the thread needs it.
- Seeded registers are matched by the `match-records` worker (cron every
  six hours, plus the post-import hook), which also writes exposure
  candidates for Variant B and for Variant C registers that carry an
  exposure config. Worker-fed registers (no exposure config) have their
  own worker (`va-enrich`).
- Variant B (entity picker, unit facts) and Variant C (save-back form)
  both have UI now; GLO is config + a PLSS geocoder away.
- Confirm-event years read `saved_payload.event_year`; Variant A registers
  that want dated confirm events define that mapping when they arrive.

## Deferred registers, and why

WWII Army enlistments as offered candidates (9M rows — needs server-side
data, not repo CSVs; the worker-fed shape `va-burials` proved is the way
in, but AAD has no API and blocks non-browser clients, so the data file
via the NARA Catalog is the route — meanwhile `aad-wwii-enlistment` ships
as a deep-link register), Chinese Head Tax (source review), Dawes Rolls
(sensitivity review first), WWI draft cards (index closed to us —
deep-link only).
