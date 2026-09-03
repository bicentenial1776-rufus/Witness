# Witness — Acadian Great Deportation person-level enrichment

## Context

Witness already has (a) a Supabase schema with imported GEDCOM persons/events, (b) a "their world" AI narrative with a sourced-archive tier (labelled by archive name, e.g. "From Chronicling America") and a general-knowledge historical tier (labelled "Historical context"), and (c) a Find a Grave pattern: we never scrape or ingest third-party compilations wholesale; we derive candidates from GEDCOM facts, deep-link the user to the source in an in-app browser, and let the user confirm and save a URL back to the person record.

This task adds a **new sourced-archive tier: Acadian Great Deportation (1755–1764) person-level records**, using that same pattern, plus a small curated dataset built only from public-domain primary sources.

**Do not write code until Phase 0 is reviewed and approved.**

---

## Phase 0 — PROJECT_BRIEF section (stop and wait for approval)

Add a section to PROJECT_BRIEF.md titled "Acadian Deportation Records" that locks these decisions. Present it to me with a plain-language summary and ask whether I understand and agree before continuing.

Irreversible / architectural decisions to lock:

1. **Data provenance rule.** The curated table contains only facts attributable to public-domain primary records (British/colonial government documents, 1755–1764): Lt.-Col. Winslow's Grand-Pré prisoner lists, ship embarkation/arrival returns, and colonial assembly returns of received Acadians. Volunteer transcription sites (acadian-home.org, acadian.org) and WikiTree Acadians Project pages are used as **finding aids and deep-link targets only**. We do not copy their tables, annotations, or identifications into our database. Stephen White's *Dictionnaire généalogique des familles acadiennes* is never ingested.
2. **Scope for v1.** Grand-Pré (Winslow lists, Sept–Oct 1755) and the seven Chignectou ships to South Carolina/Georgia (sailed 13 Oct 1755). Nothing else until the acceptance test passes. Pisiquid is explicitly out of scope — no reliable list exists.
3. **Match semantics.** The system produces *candidate* matches only, in keeping with the 22-type data-quality taxonomy and the "curiosities not verdicts" framework. A candidate becomes a confirmed link only when the user confirms it. No auto-linking.
4. **Narrative integration.** Confirmed links feed the sourced-archive tier with the provenance label "From Deportation records (Grand-Pré, 1755)" or "From Deportation records (Chignectou–Carolinas, 1755)". Unconfirmed candidates never appear in narrative prose; they appear only as a Tree Health curiosity card.
5. **Name normalization.** Implement a deterministic Acadian surname/given-name normalizer (dit-names, common spelling variants, French/English given-name equivalents). The variant table is a versioned data file, not hardcoded logic. Flag that this is a first pass and will be tuned.

## Phase 1 — Data model

Add to the Supabase schema (migration, not manual edit):

- `deportation_records` — one row per named person or household head as recorded:
  - `id`, `source_document` (enum: winslow_grandpre_1755, chignectou_ships_1755), `source_citation` (free text, archival reference), `finding_aid_url` (link to the transcription/WikiTree page used to locate the record)
  - `name_as_recorded`, `surname_normalized`, `given_normalized`
  - `household_role` (head, wife, son, daughter, single_man, unknown), `household_size_sons`, `household_size_daughters` (nullable; Winslow recorded these)
  - `origin_settlement` (Grand-Pré, Rivière-aux-Canards, Pisiquid, Beaubassin, etc.), `ship_name` (nullable), `embark_date`, `destination_colony`, `arrival_date` (nullable)
  - `confidence_of_transcription` (high/medium/low — how legible/unambiguous the primary record is)
- `deportation_candidates` — links a Witness `person_id` to a `deportation_record_id` with `match_score`, `match_reasons` (JSON array of reason codes), `status` (candidate / confirmed / rejected), `confirmed_at`, `confirmed_by_user`.
- Add an issue type to the 22-type taxonomy: `possible_deportation_record` (curiosity, not verdict).

Seed the `deportation_records` table via a versioned seed script from a CSV I can read and correct. Each row must carry `source_citation` and `finding_aid_url`. If a fact isn't in a primary record, leave it null — do not infer.

## Phase 2 — Exposure heuristic and candidate generation

Implement `acadianExposure(person)` in the TypeScript enrichment modules (alongside GeoNames and Chronicling America), returning a score and reason codes. Signals, from GEDCOM facts already in the database:

- Birth or any event before 1756 in a place geocoded to Nova Scotia / Acadia / New Brunswick / Île Saint-Jean (PEI) / Île Royale (Cape Breton), or place text matching Acadian settlement names.
- Later events (marriage, child birth, death) 1755–1800 in Louisiana, Maryland, Pennsylvania, Massachusetts, Connecticut, South Carolina, Georgia, Quebec, Saint-Malo / Belle-Île / other French ports, or Saint-Pierre-et-Miquelon.
- Surname on the Acadian family-name roster (build this as a normalized list from the primary 1671–1752 censuses, not copied from a secondary site).
- Any of these alone is weak; two or more together is a candidate.

For persons with exposure above threshold, run name-normalized matching against `deportation_records`. Score on: surname match, given-name match, plausible age at 1755 relative to household role, origin settlement consistent with GEDCOM birthplace, destination consistent with later GEDCOM events. Write the scoring function so each factor is an explicit, adjustable weight.

Emit a `deportation_candidates` row and a `possible_deportation_record` Tree Health issue for each candidate above threshold. Cap at 5 candidates per person; list the rest as "more possible matches" behind a tap.

## Phase 3 — UX (reuse Find a Grave flow)

- Tree Health card: "Possible match in 1755 Deportation records" with the recorded name, ship/settlement, destination, and household composition. Buttons: **View source** (opens `finding_aid_url` in the in-app browser), **This is them**, **Not them**.
- On confirm: set status, attach the record to the person, and make the record available to the narrative prompt with the provenance label above.
- On reject: status = rejected, suppress for that pairing, keep the row for QA.
- Use existing Witness brand tokens; no new design system elements.

## Phase 4 — Narrative prompt addition

Extend the "their world" prompt with a block for confirmed deportation records, same tone/voice as the existing prompt. Supply only the record facts and the household context; the general-knowledge tier already covers the event itself. The model should weave the record into prose ("British soldiers recorded Joseph, with two sons and one daughter, among the men held in the church at Grand-Pré…"), not list it. Log any decline/silent output, per the existing QA rule.

## Phase 5 — Tests and acceptance

- Unit tests for the normalizer (dit-names, variants, French/English equivalents), the exposure scorer, and the match scorer — with fixtures I can read.
- Seed-data validation test: every row has a citation and a finding-aid URL; no nulls in required fields.
- **Acceptance test:** run the pipeline on the Howe/Field GEDCOM. Report: how many persons scored as Acadian-exposed, how many candidates were generated, and for the known Acadian thread, whether the expected individuals surfaced as candidates with sensible scores. Show me the top candidates with their reason codes. If the known thread does not surface, diagnose before tuning weights.
- Performance: candidate generation must not measurably slow GEDCOM import; run it as a post-import enrichment job like Chronicling America.

## Documentation

- Update the enrichment-modules README with: data provenance rule, sources used, the normalizer's variant file format, how to add records to the seed CSV, and how to widen scope (next candidates: 1755 Grand-Pré ships to Pennsylvania/Maryland; 1758 Île Saint-Jean ships to France).
- Add a short "How we handle Acadian records" note to the App Store support page content, since Acadian-descendant users will ask.

## Working style

Before each phase, show me what you are about to do and why, in plain language, and check that I've understood. Read the code back to me at the level of "what this function decides," not line by line. Flag any place where the data is thinner than this prompt assumes.
