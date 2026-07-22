# NARA Catalog API — Research Notes for Witness

**Status:** API key applied for, not yet received. This doc captures research findings prior to hands-on testing.

## Why we're looking at this

- Original driver: FamilySearch declined a partnership ("too new, not enough value yet") — looking for alternative enrichment sources.
- Secondary driver: pre-release tester feedback that Witness "feels like a history app" / historical fiction — suggests narrative/historical-color content may resonate independently of hard genealogical proof.
- GenealogyBank was investigated first — no public developer API found; would require a direct data-licensing conversation with NewsBank.

## Catalog scale

- Total NARA holdings: 13+ billion paper records.
- Digitized in the online Catalog: ~270 million pages (as of April 2024), with a goal of 500 million by September 30, 2026.
- ~28 million+ archival descriptions in the Catalog (last published figure).
- Much of the digitized genealogical content came via partnerships with Ancestry.com and FamilySearch (~153M pages) — meaning military, immigration, and similar record types are disproportionately represented.

## Access & terms

- Free, but requires emailing `Catalog_API@nara.gov` for a key — no self-serve signup.
- Default key is **read-only**; read/write (tags, transcriptions, comments) requires a separate request.
- Rate limit: **10,000 queries/month** default. Higher tiers (150K, 1.5M) available on request with justification; unlimited for signed NARA partners.
- Current API version is **v2** (`catalog.archives.gov/api/v2`) — legacy v1 was retired September 2023.
- **Critical constraint:** terms explicitly prohibit caching/storing API response content, and prohibit bulk scraping (use the AWS Open Data Registry for bulk needs instead). Implication for Witness: treat NARA lookups as live, fetch-on-view queries rather than something synced into Supabase for offline use — need to confirm with the API team whether this applies to normal per-user/per-query caching or is aimed at large-scale mirroring.
- Attribution required in-app: *"This product uses the National Archives Catalog API but is not endorsed or certified by the National Archives and Records Administration."*

## Data elements (per record)

Keyed by **NAID** (National Archives Identifier). Notable fields:

- `title`, `scopeAndContentNote` — free-text description, often long/narrative
- `productionDates` — structured year/month/day
- `typeOfMaterials` / `generalRecordsTypes` — photos, textual records, maps, sound, moving image, artifacts
- `digitalObjects` — direct file URLs when digitized
- `ancestors` — hierarchical context (collection → series → file unit → item), each with dates/titles/creators
- `creators` — linked authority records for people/orgs
- `physicalOccurrences` / `referenceUnits` — holding facility
- `accessRestriction` / `useRestriction` — rights status
- Public contributions (tags, transcriptions, comments) — queryable, and writable with a write key

## Matching a record to a specific person (confidence model)

No native "this record is about person X" concept — needs a scoring layer built on top:

- **Name** — full-text `q` search against title/scopeAndContentNote; surname match is reliable, given-name matching is noisy (nicknames, spelling variants)
- **Date range** — `productionDates` vs. person's lifespan, or a tighter record-type-implied window (e.g., draft age 18–45)
- **Place** — when available; varies a lot by record type
- **Record-type plausibility** — hard filter (e.g., WWII draft card requires draft-age during that war)

Proposed confidence tiers:
1. **High** — exact name + tight date window + place match
2. **Possible** — surname match + plausible date window, no place data either way
3. **Weak/speculative** — surname only, wide date tolerance

Aligns with the existing "curiosities not verdicts" taxonomy — display the tier, don't present speculative matches as confirmed.

## Story generation flow (if pursued)

1. Confidence tier gates the flow — sub-"high" matches should surface an explicit confidence interstitial before story generation, not silently proceed.
2. Pull full record (scopeAndContentNote, dates, ancestors, digital objects) live — no caching per terms above.
3. Feed into AI enrichment layer with explicit instruction to preserve hedging language for anything below high confidence (no confident first-person narrative for speculative matches).
4. Attribution notice displayed on the story/source screen.
5. Storage: the generated story text is our own derivative content and can be stored in Supabase (the no-cache term applies to NARA's raw response, not our output) — but need a policy for staleness/re-verification if the underlying record or match confidence is later revisited.

Open question: single-record stories only for v1, or merge multiple corroborating records into one narrative? Latter adds real complexity (caching, attribution, confidence blending) — recommend deferring.

## Recommendation

Worth testing, not worth committing to the roadmap yet.

- All constraints are engineering problems, not dead ends.
- 10K queries/month is more than enough for a 3-tester pilot.
- But: match quality for common surnames may skew heavily toward "weak" tier — risk of underwhelming once novelty wears off.
- **Cheapest next step once the API key arrives:** manually query a sample of the Howe/Field validation dataset (5,495 individuals — surnames/dates already in hand) directly via curl/Swagger, no app code required, to see actual hit-rate and confidence distribution before building any matching/scoring/story-generation pipeline.
