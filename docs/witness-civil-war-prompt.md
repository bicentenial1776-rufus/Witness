# Witness — American Civil War enrichment (regiment-first, person-confirmed)

## Context

Witness has a Supabase schema with imported GEDCOM persons/events, TypeScript enrichment modules (GeoNames geocoding, Chronicling America), a "their world" AI narrative with a sourced-archive tier (labelled by archive name) and a general-knowledge historical tier (labelled "Historical context"), a 22-type data-quality taxonomy built on "curiosities not verdicts," a proximity-to-ancestors map, and a Find a Grave pattern: we never scrape or ingest third-party compilations; we derive candidates from GEDCOM facts, deep-link the user to the source in an in-app browser, and let the user confirm and save the result back to the person record.

An Acadian Deportation enrichment (see PROJECT_BRIEF.md) follows this pattern with a small curated person-level table. The Civil War is different: the person index is 6.3 million rows and name-only, so **the unit of ingestion is the regiment, not the soldier.** Roughly 3,500–4,000 units carry the entire story; soldiers are attached to units by the user, or parsed from GEDCOM military events.

**Do not write code until Phase 0 is reviewed and approved.**

---

## Phase 0 — PROJECT_BRIEF section (stop and wait for approval)

Add a section "Civil War Enrichment" to PROJECT_BRIEF.md locking the following. Present it with a plain-language summary and ask whether I understand and agree before continuing.

1. **Regiment-first architecture.** We ingest unit-level data (organization, movements, engagements with dates and places) from public-domain sources. We do not ingest the 6.3M-name NPS Civil War Soldiers and Sailors System (CWSS) index, any state roster wholesale, or any commercial dataset (Historical Data Systems / Ancestry, Fold3).
2. **Source provenance rule.** Unit data comes only from: Frederick H. Dyer, *A Compendium of the War of the Rebellion* (1908, public domain, Part 3 regimental histories); NPS CWSS unit histories and NPS battle summaries (US government works); NARA Catalog API records where our key allows. Confederate unit data is thinner and partly secondary; the tier must say so (see decision 6).
3. **Person-level linking is user-confirmed only.** Witness derives a "possible Civil War soldier" curiosity, builds a CWSS search deep-link, and the user confirms the record and unit. No automatic name matching against CWSS. Exception: if the GEDCOM already contains a military event with a parseable unit string, we attach the *unit* automatically with status `parsed_from_gedcom` and show it as a fact, not a curiosity.
4. **Narrative integration.** Confirmed or GEDCOM-parsed units feed the sourced-archive tier with provenance label "From regimental records (Dyer's Compendium, 1908)" or "From regimental records (NPS)". The general-knowledge tier continues to handle the war itself; this tier supplies what *this regiment* did and when.
5. **Map integration.** Engagement locations for a confirmed unit become geocoded event points for that person, tagged as unit-level (the regiment was there; the individual probably was), and shown on the proximity map with a distinct marker style.
6. **Confederate coverage caveat.** Dyer's is Union-only. Confederate unit entries use NPS unit histories; where those are sparse, the tier returns nothing rather than filling from general knowledge, and the person card shows "Limited Confederate unit records available."
7. **Unit normalizer.** A deterministic parser for unit designations ("Co. K, 5th Iowa Inf.", "5 IA INF", "Fifth Regiment Iowa Volunteer Infantry") producing a canonical unit key matching the NPS unit-code scheme. Variant rules live in a versioned data file.

## Phase 1 — Data model

Migrations, not manual edits.

- `cw_units` — `id`, `unit_key` (canonical, NPS-style), `side` (union/confederate), `state`, `branch` (infantry/cavalry/artillery/other), `number`, `display_name`, `organized_date`, `organized_place`, `mustered_out_date`, `source` (dyer/nps/nara), `source_citation`, `finding_aid_url` (NPS unit page), `history_text` (the Dyer/NPS service narrative, verbatim, PD).
- `cw_unit_events` — one row per dated movement/engagement: `unit_id`, `event_date` (or date range), `event_type` (organized, moved, engagement, siege, garrison, mustered_out), `place_text`, `geocoded_lat/lng` (via existing GeoNames module), `battle_id` (nullable), `source_citation`.
- `cw_battles` — from NPS battle summaries: `id`, `name`, `dates`, `place`, `lat/lng`, `summary_text`, `nps_url`.
- `cw_person_units` — `person_id`, `unit_id`, `company` (nullable), `rank` (nullable), `status` (parsed_from_gedcom / candidate / confirmed / rejected), `cwss_record_url` (nullable, saved on confirm), `confirmed_at`.
- New taxonomy issue types: `possible_civil_war_soldier` (curiosity) and `military_unit_unparsed` (a GEDCOM military event we could not parse — surface to user, log for normalizer tuning).

Seed via versioned scripts. Dyer's Part 3 is on the Internet Archive / HathiTrust as OCR text; expect OCR noise and build the parser defensively. Write the ingestion so it's re-runnable and idempotent. Keep raw source text alongside parsed rows for audit.

## Phase 2 — Unit normalizer and GEDCOM parsing

- Implement `parseUnitDesignation(text)` → `{ unit_key, company, rank, confidence }`. Handle ordinal numbers, state names/abbreviations, branch words and abbreviations, "Volunteers", "Regiment", USCT designations, and the common Ancestry-export phrasings. Unit test with at least 50 real-world strings (I will supply some from the Howe/Field GEDCOM; generate the rest from Dyer's).
- Scan GEDCOM events tagged MILI, EVEN with type "Military", or free-text notes containing regiment patterns. Attach a `cw_person_units` row with `parsed_from_gedcom` when confidence is high; emit `military_unit_unparsed` otherwise.

## Phase 3 — Person-level exposure and deep-link

- `civilWarExposure(person)` → score and reason codes from existing facts: male, born 1815–1848, alive during 1861–1865, any event in the US 1850–1870, state of residence in 1860 if known.
- Above threshold and no unit already attached: emit `possible_civil_war_soldier` curiosity with a CWSS search deep-link prefilled with surname, given name, and (if known) state. Card buttons: **Search records** (in-app browser), **Add unit** (opens the unit picker, autocomplete over `cw_units`, prefilled from anything the user pastes), **Not a soldier**.
- On confirm: save `cwss_record_url`, unit, company, rank; status = confirmed.
- Use existing Witness brand tokens; no new components beyond the unit picker.

## Phase 4 — Narrative and map

- Extend the "their world" prompt with a block for attached units: unit display name, organized date/place, the dated engagement list, mustered-out date, and the caveat that facts are unit-level. Same tone/voice as the existing prompt; weave, don't list. Log declines per the existing QA rule.
- Add unit engagement points to the proximity map for confirmed/parsed persons with a distinct marker and a "regiment was here" label. Respect the existing 100-mile radius decision.
- Tree Health: a confirmed unit surfaces a "Regiment timeline" card linking to the person story.

## Phase 5 — Tests and acceptance

- Unit tests: normalizer (≥50 strings), Dyer's parser (sample of 20 regiments across branches and states, including a messy OCR case), exposure scorer, GEDCOM military-event extraction.
- Seed validation: every unit has a source citation; every engagement has a date and place; geocoding success rate reported.
- **Acceptance test:** run on the Howe/Field GEDCOM. Report: persons flagged as possible soldiers, GEDCOM military events found and parse rate, units attached, and for each attached unit the number of engagements ingested and geocoded. Show me one generated narrative for a soldier with a parsed unit. If parse rate on real GEDCOM strings is below ~80%, stop and diagnose before widening.
- Performance: ingestion is a one-time seed; per-person work runs as a post-import enrichment job like Chronicling America.

## Documentation

- README section: provenance rule, sources, how Dyer's was parsed and how to re-run it, unit-key scheme, normalizer variant file format, Confederate coverage caveat, and the next widening candidates (state adjutant-general rosters; 1890 Veterans Schedule via NARA; pension index).
- Support-page note: "How Witness handles Civil War service records," including that we link to NPS/NARA rather than hold service records ourselves.

## Working style

Before each phase, show me what you're about to do and why, in plain language, and check that I've understood. Read code back at the level of "what this function decides." Flag anywhere the source data is thinner than this prompt assumes — especially Dyer's OCR quality and Confederate coverage.
