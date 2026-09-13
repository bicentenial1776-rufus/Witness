# Witness — Historical Record Registers: framework + register package

**Revision of 2026-09-02** — the Claude-chat draft ("Historical Record Tiers"),
amended after a code review against the repo. The amendments, in brief:

1. **Renamed "tiers" → "registers."** "Tier" already means four other things in
   this codebase (relationship-taxonomy tiers, Lived-Through tier ranking, the
   curated-events `tier` column, the family-context history tier). The concept
   here is a register: a named record set with provenance. Tables and modules
   below use the register vocabulary.
2. **Added "What already exists" (Phase 0.1).** Witness has shipped three
   bespoke instances of this framework's shape; the framework adopts their
   patterns and does not migrate their tables.
3. **Corrected the module homes.** There is no GeoNames anywhere in the
   codebase (geocoding is Nominatim via a pg_cron worker), and Chronicling
   America lives in server edge functions, not core modules. The framework is
   placed explicitly across core / edge / CLI.
4. **Named the compute location.** Where exposure scoring and matching run was
   unstated; it is now locked (CLI first, edge worker as a framework
   milestone), following the shipped Crossing precedent.
5. **Corrected the UI plan.** Verdict cards live on the Portrait, findings
   feed the daily edition; Tree Health gets aggregate research-queue checks
   only — never per-candidate confirm/dismiss cards.
6. **Added the re-import survival invariant.** Individual ids are reassigned
   on every GEDCOM refresh; confirmed links must ride the pulse carry-forward
   or they die at the user's next re-import. (The Crossing verdicts were
   patched into that carry the same day this revision was written.)
7. **Added the RLS section** and source-accuracy cautions (deep-link
   verification, Filles du Roi PD thinness, PLSS v1 precision).

The two detailed prompts already written (`witness-acadian-deportation-prompt.md`,
`witness-civil-war-prompt.md` — not yet in the repo) remain the authoritative
specs for those two registers, re-read through this document's corrections.
Where they conflict with this document, this document wins.

**Do not write code until Phase 0 is reviewed and approved.**

---

## Phase 0 — PROJECT_BRIEF: "Historical Record Registers" (stop and wait)

Write this section into PROJECT_BRIEF.md, summarize in plain language, confirm
understanding, then wait.

### Phase 0.1 — What already exists (the framework's ground truth)

Witness has already shipped three one-off implementations of this exact shape.
The framework **adopts their patterns; it does not migrate their tables**:

- **Variant A, shipped:** the Crossing Library (`passenger_candidates`,
  2026-09-02). Snapshot-style candidate rows (record fields denormalized into
  the candidate, so candidates survive dataset edits), per-user verdicts
  (pending/confirmed/dismissed), Portrait card with This-is-them / Not-them,
  confirm writes a provenance-carrying event, strong candidates noticed on the
  findings ledger, a "?" explainer on every label. Matching is a deterministic
  CLI run (`match-passengers --tree X --write`) that never clobbers a verdict.
- **Variant ~C with a worker, shipped:** NARA (`nara_documents` global cache +
  `nara_candidates` per-user verdicts, budgeted cron worker `nara-enrich`,
  Portrait card, deep links to the catalog).
- **Variant C save-back, shipped:** Find A Grave deep-link-and-confirm
  (`grave_confirmations`: prefilled search out, paste-to-confirm, URL stored),
  plus the prefilled FamilySearch/Ancestry search doors (`record-search.ts`,
  era-aware collection routing).

New registers copy these shapes. If the generic tables below ever absorb the
shipped three, that is its own migration project with its own approval — not a
side effect of this one.

### Shared invariants (all registers)

1. **Provenance.** Only public-domain or government-work sources are ingested.
   Copyrighted compilations (volunteer transcription sites, WikiTree, NEHGS,
   Ancestry/HDS, Fold3, FamilySearch indexes, Stephen White, Landry) are
   finding aids and deep-link targets only. Every ingested row carries
   `source_citation` and, where one exists, `finding_aid_url`.
2. **Curiosities, not verdicts.** Every person→record link is a `candidate`
   until the user confirms. No auto-linking, with one exception: a fact
   already present in the GEDCOM (e.g. a parseable military unit string) may
   be attached with status `parsed_from_gedcom`.
3. **Provenance labels in narrative.** Confirmed links feed the sourced tier
   of narrative under a register-specific label ("From Deportation records
   (Grand-Pré, 1755)", "From regimental records (Dyer's Compendium, 1908)",
   "From BLM land patents"). Candidates never appear in prose.
4. **Silence over guessing.** A register returns nothing when data is thin;
   declines are logged for QA.
5. **Post-import enrichment, never import-path work.** Register work runs
   after import; import speed is not affected. (See "Where compute runs" —
   the precedents are the NARA cron worker and the Crossing CLI, not
   Chronicling America, which is on-demand per-person enrichment.)
6. **Reversible scope.** Each register launches with the narrowest
   well-documented slice; widening is a data-file change plus a re-run, not a
   code change.
7. **Re-import survival (new, load-bearing).** Individual ids are reassigned
   on every GEDCOM refresh. `pulse/refresh.ts` carries the researcher's own
   rows (briefs, corrections, notes, NARA verdicts, grave confirmations,
   crossing verdicts) onto the new tree by remap. `person_register_links`
   with status confirmed / rejected / parsed_from_gedcom MUST join that
   carry-forward from day one — pending rows are machine suggestions and are
   deliberately left to regenerate. A register whose confirmed links die on
   refresh is defective.

### Three register variants (the framework must support all three)

| Variant | Shape | Registers |
|---|---|---|
| **A — Curated person table** | Small seed table of named individuals from primary records; candidate matching by normalized name + place + date; user confirms | Acadian Deportation, Loyalists, Filles du Roi (already proven by the Crossing Library) |
| **B — Entity table, person attaches** | Ingest an entity set (regiments) with dated, placed events; person links to an entity, and the entity's events become unit-level facts for that person | Civil War (genuinely new — nothing shipped is entity-shaped) |
| **C — Deep-link + structured save-back** | No seed table; exposure heuristic → prefilled external search → user confirms and Witness saves a structured record (URL + key fields), optionally geocoded | BLM GLO patents, CEF WWI, Home Children, Grosse-Île, CWSS person lookup (pattern proven by grave-link + record-search) |
| **C, worker-fed** (added 2026-09-13) | No seed table; a server worker queries a source too large to seed, scores rows in core, and inserts candidate links with the record snapshot in `saved_payload`; the reader confirms as for any candidate | Veterans' gravesites (`va-burials`, shipped); the AAD WWII enlistment file and Chronicling America obituaries are the same shape |

### Where compute runs (decided, was unstated)

- **Seeding**: CLI scripts (`registers/seed/`), idempotent, like
  `import-passenger-list.ts`. Raw source text stored beside parsed rows.
- **Exposure scoring + Variant A matching**: pure functions in
  `packages/core`, executed by a CLI (`match-registers --tree X --write`)
  at launch — the Crossing precedent; deterministic, no API budget, verdicts
  never clobbered on re-run. A service-role **edge worker** that runs the same
  core functions after import lands as a framework milestone (target: before
  the third register ships), following the `nara-enrich` conventions
  (cron-secret auth, bounded work per tick, drain-state table). Core code is
  mirrored into `supabase/functions/_shared/` under the repo's portSync
  convention when that happens.
- **Narrative**: the sourced blocks are assembled **server-side** where
  prompts are built (generate-biography / story-arc / family-context edge
  functions). `registers/narrative.ts` in core produces the provenance-labeled
  blocks; the edge functions consume them. This touches prompt assembly and
  edge deploys — plan those changes as such.
- **Verdicts and save-back**: client-side, RLS-scoped, like every shipped
  card.

### Build order (locked)

1. Framework (Phase 1)
2. Acadian Deportation — proves Variant A on a tiny table with a known
   acceptance thread
3. Civil War — proves Variant B and the unit-string parser
4. BLM GLO land patents — proves Variant C and parcel-to-coordinate geocoding
   for the proximity map
5. Loyalists — second Variant A, tests whether adding a register is truly
   config + data
6. CEF WWI, Home Children, Grosse-Île, Filles du Roi — config-only additions;
   if any needs new code, that's a framework defect to fix, not a one-off patch

Deferred, decide later: WWII Army enlistments (NARA AAD; bulk-downloadable
person table — Variant A at 9M rows, which the framework must not assume:
anything past ~50k rows is server-side data, per the Famine Irish finding),
Chinese Head Tax, Dawes Rolls (sensitivity review first), WWI draft cards
(deep-link only; the index is closed to us).

---

## Phase 1 — Framework

### Data model (migrations)

- `registers` — the catalog: `register_key`, `display_name`, `variant`
  (A/B/C), `provenance_label`, `coverage_caveat` (nullable text shown on
  cards, e.g. the Confederate limitation), `status` (active/disabled),
  `config` (JSON: exposure weights, match weights, thresholds, deep-link
  template, marker style).
- `register_records` — Variant A/B rows, one table with `register_key`
  discriminator: `id`, `register_key`, `record_kind` (person/entity),
  `name_as_recorded`, `surname_normalized`, `given_normalized`, `entity_key`
  (canonical key for Variant B), `attributes` (JSON, register-specific fields
  validated against a per-register schema), `source_citation`,
  `finding_aid_url`, `transcription_confidence`.
- `register_record_events` — dated/placed events attached to a record
  (Variant B unit movements; also usable for Variant A where the primary
  record gives dates): `record_id`, `event_date`/range, `event_type`,
  `place_text`, `lat/lng`, `linked_event_ref` (e.g. battle id),
  `source_citation`.
- `person_register_links` — `individual_id`, `tree_id`, `user_id`,
  `register_key`, `record_id` (nullable for Variant C), `status`
  (parsed_from_gedcom / candidate / confirmed / rejected), `match_score`,
  `match_reasons` (JSON), `saved_payload` (JSON — Variant C structured
  save-back: URL, key fields, geocode), `confirmed_at`. Denormalize the
  fields a card renders (the Crossing lesson: a card must not need a join
  into a dataset that can be re-seeded under it). Unique
  `(individual_id, register_key, record_id)` with the Variant C null handled
  explicitly.
- **RLS (new section).** `registers`, `register_records`,
  `register_record_events`: global reference data — `select` for
  authenticated, writes by service role/seed only (the `nara_documents`
  pattern). `person_register_links`: `auth.uid() = user_id` for the user's
  own rows; when a future worker inserts candidates, split the policies the
  way `nara_candidates` does (user select + update-only; inserts from the
  worker). Family sharing: links are per-user verdicts (the
  `grave_confirmations` position) — a seat-holder sees their own, not the
  owner's, until a deliberate decision says otherwise.
- **Carry-forward.** Add non-pending `person_register_links` to
  `pulse/refresh.ts` `fetchCarryables`/`applyRefresh` in the same PR that
  creates the table — clear-the-duplicate-then-move, exactly like the NARA
  and crossing verdicts.
- Taxonomy: **no new Tree Health issue types.** Tree Health's check catalog is
  a closed union of internal-consistency checks. Registers surface as: (a)
  Portrait candidate cards, (b) findings-ledger rows (the existing `source`
  registry gains one `'register'` value, parameterized by `register_key` in
  the finding id), and (c) at most one aggregate Tree Health check of the
  "N possible records blocked by missing dates" shape — a research-queue
  count, never a per-candidate verdict. `unparsed_structured_fact` (e.g. a
  military unit string that would not parse) fits Tree Health and may be
  added there.

### Modules

In `packages/core/src/registers/` (pure logic, unit-testable — placed next to
`history/` and `query/`, which is where the reusable machinery lives; there is
no GeoNames module, and Chronicling America is an edge function, not a
neighbor):

- `registry.ts` — loads `registers`, exposes active ones.
- `exposure.ts` — generic scorer: a person's facts + a register's exposure
  config (date windows, place patterns, sex, surname lists) → score + reason
  codes. Reuse the existing machinery: `classifyPlace`,
  `regionsFromPlaceParts`, and the date-window logic in
  `rankLivedThroughEvents` already do most of this. Register-specific signals
  are config; only genuinely novel logic goes in a per-register plugin.
- `match.ts` — Variant A matcher: start from `matchPassengers`'s proven
  soundex + year-plausibility core (`history/passengers.ts`), parameterized
  by config weights. Cap 5 candidates per person.
- `normalizers/` — `acadianNames.ts`, `unitDesignation.ts`, later
  `loyalistNames.ts`; each backed by a versioned variant data file. Keep them
  separate; do not generalize prematurely.
- `deeplink.ts` — prefilled search URLs from a template + person facts.
  Extend `apps/mobile/src/lib/record-search.ts`'s pattern (and reuse its
  `splitSearchName`); **every deep-link template must be verified against the
  live target before a register ships** — FamilySearch's `q.*` params
  verified; the Ellis Island Foundation's did not exist; GLO and LAC are
  unverified (see per-register notes).
- `narrative.ts` — per-register prompt blocks for confirmed/parsed links,
  each carrying its provenance label; consumed by the narrative edge
  functions (see "Where compute runs").
- `map.ts` — geocoded points from `register_record_events` and Variant C
  `saved_payload`, per-register marker style, "entity was here" vs "person
  was here" flag.
- Seeds live in `packages/core/scripts/` beside the passenger importers.

### UI (existing brand tokens; new components only where listed)

- **One generic Portrait candidate card** (generalizing
  `PassengerCandidateCard` / `NaraCandidateCard`): register label with its
  "?" explainer (the `ExplainerDot` + explainer-text pattern), record
  summary, coverage caveat when the register carries one, plain-words match
  reasons, **View source** / **This is them** / **Not them**. Variant B adds
  **Add unit** (entity picker with autocomplete). Variant C adds **Search
  records** (in-app browser) and **Save this record** (structured payload —
  the grave-link paste-to-confirm shape).
- Findings: strong candidates are noticed on the ledger and print in the
  daily edition, the Crossing way. No new shelf.
- Person story: confirmed registers appear inline in narrative under their
  provenance labels; the Portrait's records area lists confirmed links with
  source links.
- Map: per-register marker styles; the 100-mile "same region" radius from
  `family/relatives.ts` stands.

### Tests

- Framework tests with a synthetic register of each variant.
- Per-register tests live with the register.
- Carry-forward tests in `pulse/__tests__` for `person_register_links`.
- Acceptance harness: a script that runs all active registers on a GEDCOM and
  reports, per register: persons exposed, candidates, parse rates, links,
  geocoded points. Run it on Howe/Field after every register is added.

---

## Phase 2 — Register specs

### 2.1 Acadian Deportation (Variant A)
Per `witness-acadian-deportation-prompt.md`, re-expressed on the framework:
seed CSV into `register_records` with `attributes` {household_role, sons,
daughters, origin_settlement, ship, embark_date, destination, arrival_date};
`acadianNames` normalizer; exposure config = pre-1756 Acadian places + later
exile places + surname roster. PD primary material exists (deportation-era
lists in PD compilations such as Placide Gaudet's work). Acceptance: the
Howe/Field Acadian thread surfaces.

### 2.2 Civil War (Variant B)
Per `witness-civil-war-prompt.md`, re-expressed: Dyer's Compendium (1908, PD)
+ NPS unit histories into `register_records` (record_kind = entity) and
`register_record_events`; NPS battle summaries as a linked reference table;
`unitDesignation` parser; GEDCOM military events → `parsed_from_gedcom` links;
CWSS deep-link for person lookup (verify the CWSS URL scheme accepts prefilled
parameters before shipping); Confederate coverage caveat on cards. Acceptance:
≥80% parse rate on real GEDCOM unit strings; one generated narrative.

### 2.3 BLM GLO land patents (Variant C) — rewritten 2026-09-13

**The target moved under the plan.** On 2026-07-13 BLM re-platformed
glorecords.blm.gov onto Salesforce Experience Cloud at `/s/`. Verified by
curl on 2026-09-13: every legacy URL (`/search/default.aspx`,
`/details/patent/default.aspx?accession=…`) answers 301 to the bare shell,
and the legacy XML Web Services (`/WebServices/`, once "direct access to
all of the data behind the website") answer 401 behind a login. The new
site documents no API, no CSV export, no bulk download; a July 2026
practitioner review found its map search non-functional. The "prefilled
hash-fragment URL" caution above is therefore moot — there is nothing to
prefill. Everything below supersedes the original section.

- Exposure: unchanged — any US event 1800–1935 outside the original
  thirteen colonies' settled regions; stronger for public-land states and
  for events in a county with active land offices in the person's adult
  years (a small config table of public-land states suffices for v1).
- Deep-link: `https://glorecords.blm.gov/s/` in the in-app browser, with
  the card printing the search the reader should type beside the button
  ("Search for HOWE, Josiah · Ohio") — the site's search is a form the URL
  cannot fill. **Before building, ask BLM** (Eastern States Office / the
  GLO records contact on the site) whether the web services survive behind
  a developer account. A Salesforce SPA is not to be scraped; if no
  developer access exists, the manual save-back below is the product.
- Save-back payload: unchanged — accession number, patent date, land
  office, authority (Homestead Act 1862, cash sale, military warrant…),
  acreage, and the legal land description (state, meridian, township,
  range, section, aliquot parts). The save-back form is the Variant C UI
  the framework still lacks; it arrives with this register (or with the
  AAD enlistment register, whichever ships first).
- Geocoding: **verified live** — BLM's PLSS CadNSDI ArcGIS REST service,
  `https://gis.blm.gov/arcgis/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI/MapServer`
  (layers: Township; First Division = section; Intersected = aliquot
  parts), queried by PLSSID or township/range/section with `f=geojson`
  returns the polygon. v1 stores the section centroid as `latitude` /
  `longitude` in `saved_payload` (that is what `pointsFromSavedPayloads`
  reads and the Ancestor Map now draws, since the va-burials register)
  and keeps the polygon GeoJSON in the payload for a later parcel outline.
  Aliquot-part precision uses the Intersected layer, later.
- Narrative label: "From BLM land patents." Prompt block: patent date,
  authority, acreage, place — enough for "In 1871 he proved up 160 acres
  under the Homestead Act near…"
- Lines, a cheap bonus once patents accumulate: "who else patented this
  section" — same township/range/section across a tree's confirmed
  patents is a neighbours-were-kin research lead, never a link.
- Prerequisites the framework lacks (both deferred to this register):
  `match-records` writes no Variant C candidates (exposure → candidate,
  the Variant B shape), and `RegisterCandidateCard` has no save-back
  branch for a Variant C candidate without a payload.
- Acceptance: unchanged — at least one Howe/Field ancestor with a plausible
  patent; the confirm flow completes; the parcel appears on the Ancestor
  Map at the right place (verified against the GLO map by Rufus) — plus
  the CadNSDI polygon for that section drawn where the GLO map shows it.

### 2.4 United Empire Loyalists (Variant A)
- Seed from PD primary sources only: the 1904 Ontario Bureau of Archives
  report (Loyalist claims, "Enquiry into the Losses and Services"), LAC
  Loyalist land-grant and petition indexes where the underlying records are
  Crown records, and 1784 muster/provisioning lists. Attributes:
  {origin_colony, origin_county, unit_or_association (nullable), claim_year,
  settlement_destination, land_grant_ref}. Volunteer compilations (UELAC
  lists, Loyalist Trails) are finding aids only.
- Exposure: pre-1783 events in NY, NJ, PA, New England, the Carolinas;
  post-1783 events in Ontario, Quebec, New Brunswick, Nova Scotia; surname
  continuity across the border.
- Normalizer: a `loyalistNames` variant file (Dutch/German/English
  anglicization in NY and NJ is the main problem).
- Narrative label: "From Loyalist claims and land records."
- Acceptance: adding this register required no framework code changes beyond
  the normalizer and config. If it did, stop and report what the framework
  lacked.

### 2.5 Config-only registers (Variant C unless noted)
For each: exposure config, deep-link template, save-back schema, provenance
label, coverage caveat. No new code. **All LAC deep-links must be verified
against the current Collection Search before shipping — LAC's platform
migration broke many of the old parameterized database forms.**
- **CEF WWI personnel files (LAC):** exposure = male, born 1866–1900, any
  Canadian event 1900–1920. Payload: regimental number, unit, enlistment
  date/place, birth date, next of kin. (Files are digitized Crown records.)
- **Home Children (LAC):** exposure = born UK 1855–1925, first Canadian event
  age ≤16. Payload: sending organization, ship, arrival year, receiving home.
  Coverage caveat: index only.
- **Grosse-Île quarantine (LAC):** exposure = born Ireland/UK/Europe,
  Canadian or US event 1832–1860 with Quebec/Montreal arrival. Payload: year,
  ship, status (admitted/died). Sensitive tone in narrative.
- **Filles du Roi (Variant A, tiny):** target ~770 women. **Source caution:
  this is thinner than it sounds.** The canonical roster (Landry 1992) is
  copyrighted and is a finding aid only; assembling the roster from strictly
  PD primary transcriptions (Tanguay's Dictionnaire généalogique 1871–90 and
  the PD-transcribed 1663–73 arrival records) is a genuine research task to
  budget, not a download. Attributes: {arrival_year, origin_parish, dowry,
  first_marriage_year}. Exposure = female, born France 1630–1660, Quebec
  marriage 1663–1680. If the PD roster cannot be assembled defensibly, this
  register becomes a Variant C deep-link instead — decide at seed time, not
  after.

---

## Phase 3 — Documentation

- `docs/historical-record-registers.md`: framework overview, the three
  variants, the provenance rule, the carry-forward and RLS invariants, how to
  add a register (config + seed + optional normalizer + tests), the
  acceptance harness, and the deferred list with the reason each is deferred.
- Per-register README stubs with sources, seed provenance, and widening
  candidates.
- Support-page note: "How Witness handles historical records" — we hold
  public-domain extracts and links; we do not hold or scrape commercial or
  volunteer databases.

## Working style

Before each phase and each register, show what is about to be done and why, in
plain language, and check understanding. Read code back at the level of "what
this function decides." After the Acadian and Civil War registers, stop and
report what the framework got wrong or is missing before starting GLO. Flag
anywhere source data is thinner than assumed — including in this document.
