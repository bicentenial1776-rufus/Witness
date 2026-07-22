# DPLA (Digital Public Library of America) API — Research Notes for Witness

**Status:** Research only — no API key requested yet (self-serve, instant when needed).

## Why we're looking at this

- Same driver as NARA research: exploring enrichment/historical-color data sources for Witness after FamilySearch declined a partnership ("too new, not enough value yet").
- Pre-release tester feedback that Witness "feels like a history app" / historical fiction suggests narrative and ambient historical context may resonate independently of hard genealogical proof — DPLA is well suited to that "world the ancestor lived in" angle specifically.

## Catalog scale

- Current: 30+ million items, from a network spanning 41 states and 4,000+ contributing institutions.
- Growth trajectory: 2.4M items at 2013 launch → 7M (2014) → 8M (2015) → 21M (2018) → 30M+ now — steady growth for over a decade.
- Content spans books, maps, photographs, newspapers, audio/video recordings, and physical objects (quilts, tools, everyday items) — broader material diversity than NARA's more government-record-centric holdings.

## Access & terms

- **Self-serve, instant key**: single HTTP POST to `api.dp.la/v2/api_key/YOUR_EMAIL` — key emailed immediately. No approval wait (unlike NARA).
- DPLA captures only the email address, used for aggregate usage monitoring and urgent notifications.
- **No hard rate limit** — DPLA's stated "presumption of openness" means it generally does not rate-limit API use, reserving the right to act only against abusive/degrading traffic.
- **No caching prohibition found** in published policies — unlike NARA's explicit no-cache term. Worth a final confirmation once actually integrating, but nothing in the terms currently blocks local storage of results.
- Best-effort uptime; API is versioned with advance notice of deprecations/schema changes.

## Data elements & query power

- **Object model**: `item` (single digitized piece of content) and `collection` (logical grouping of items), returned as JSON-LD.
- **Spatial search** is first-class: query by place name, US state, or precise lat/long coordinates, with geo-distance sorting support — maps directly onto Witness's existing proximity-to-ancestors map feature.
- **Temporal search**: `sourceResource.date.after` / `.before` range queries against when the object was created — clean fit for matching against a person's lifespan.
- **Subject/topic faceting** — browse by theme (e.g., immigration, Civil War), useful for the historical-color/narrative use case.
- **Field-limited fetches** — request only needed fields (e.g., title + date), reducing payload for a mobile client.
- Pagination: up to 500 items/page, 100 pages max per query.
- Notable fields: `sourceResource.title`, `.description`, `.date`, `.spatial` (name/state/coordinates), `.subject`, `.type`, `dataProvider`, `isShownAt` (link to original), `provider.name`.

## Potential fit for Witness

1. **Best fit for "historical color," not person-matching** — DPLA is a metadata aggregator across libraries/museums/archives; it's not built around named-person records the way NARA's military/service records often are. Expect most useful hits to land in "possible/weak" confidence tiers by design — good for ambient context, not for confirming a specific ancestor's involvement in an event.
2. **Complements NARA rather than duplicating it** — NARA skews government/military/immigration records; DPLA skews everyday material culture, photos, maps, ephemera. Together they cover both "official record" and "the world around the person."
3. **Native geo + date combined search is a strong technical fit** — could query "items about/near [ancestor's birthplace], created within [lifespan]" in a single call, more directly than NARA's more text/hierarchy-driven search.
4. **Lower friction for a 3-tester pilot** — instant key, no rate ceiling, no cache restriction found. Can start experimenting immediately without an application/approval wait.
5. **Period-set-dressing use case** — pulling real region/date-matched objects (quilt patterns, tools, furniture styles) could inform illustrated "Family Street View" scenes with actual researched detail instead of generic stock elements, reinforcing the "curiosities not verdicts" ethos (an honestly plausible reconstruction, not a claimed photograph).

## Assessment

Worth prioritizing over NARA for the first hands-on spike, specifically because:
- No application/approval delay — can test today.
- No rate-limit budgeting needed during exploration.
- Its geo+temporal query model may be the more natural fit for enriching the existing proximity/mapping feature and for ambient "world of the ancestor" narrative content — which is closer to what the pre-release tester responded to than confirmed-record genealogical proof.

Recommended first step (same approach as NARA): manually query a sample of the Howe/Field validation dataset (place + date already in hand) directly via the API to see actual result relevance and density before building any matching/scoring/story pipeline. No app code required, no waiting on a key.

**Open question carried over from the story-generation discussion:** if DPLA-sourced imagery/objects get folded into illustrated "Family Street View" scenes, need a policy on rights/licensing per-item (DPLA aggregates from many institutions with varying reuse terms) before using specific images in generated art, as distinct from using metadata to inform a fully original illustration.
