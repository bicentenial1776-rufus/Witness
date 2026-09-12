# WikiTree API — Research Notes for Witness

**Status:** Research only — no `appId` requested yet (self-serve, no approval wait). Findings below are from the `wikitree/wikitree-api` GitHub docs repo, not hands-on testing.

## Why we're looking at this

- Same driver as the NARA/DPLA research: exploring enrichment sources for Witness after FamilySearch declined a partnership.
- Distinct angle from NARA/DPLA: those are record archives ("here's a document that might be about your ancestor"). WikiTree is itself a genealogy tree — the interesting question is whether it can fill gaps or cross-check *the tree data itself*, not just supply historical color.
- Note on sourcing: `wikitree.com` is blocked by this environment's network policy, so these notes come from the mirrored docs at `github.com/wikitree/wikitree-api`, not the live site. Anything terms-of-service-related below should be re-verified directly against wikitree.com before committing to this integration.

## What WikiTree actually is (the key differentiator)

Unlike Ancestry or FamilySearch, WikiTree is a **single shared, collaboratively-edited tree** — one profile per real person, merged across contributors, rather than many separate private per-user trees. That's the reason this is worth more than a deep-link button: if a match is found, pulling that profile's relatives could surface people, dates, or corrections a user's own GEDCOM doesn't have. NARA/DPLA can only ever hand back "a record that might be relevant"; WikiTree can hand back actual tree structure.

## Access & terms

- **Base endpoint:** `https://api.wikitree.com/api.php`. Params via GET or POST; results as JSON.
- **No key/approval required to start** — public profiles are readable with zero authentication. This is closer to DPLA's low-friction model than NARA's approval-gated one.
- **`appId` parameter matters even though it's self-serve:** the docs warn that "queries without an id will be subject to strict rate limits." No published numeric quota found (unlike NARA's explicit 10K/month) — treat as "register an appId before doing anything beyond one-off manual testing."
- **`clientLogin` action** authenticates as a WikiTree member for profiles marked private, restricted to that member's Trusted List. Witness almost certainly only wants public-profile reads, so this path can likely be skipped.
- **Licensing: unresolved, needs direct follow-up.** The API repo's README has no data-license terms for third-party app use — it punts to WikiTree's own site-wide terms, which I couldn't fetch from this environment. Given Witness is a paid app that would display and possibly cache WikiTree-derived data, this needs a direct answer before building anything, the same way NARA's no-cache clause and DPLA's per-item image rights needed resolving.

## API surface relevant to Witness

All of these key off a **WikiTree ID** (the slug from a profile URL, e.g. `Clemens-1`) or an internal **numeric Page/User ID** (e.g. `7146`) — same identifier space, either form works. There is no way to start from nothing; you need one of these two before any of the calls below are useful.

- **`getProfile`** — single profile by `key`. `fields=*` for everything, or a specific comma list. Returns names, dates, locations, gender, privacy level, and family relationship pointers (parent/child/spouse/sibling IDs), plus biography text via `bioFormat`.
- **`getRelatives`** — takes a `keys` list (batch-capable) plus four booleans (`getParents`, `getChildren`, `getSiblings`, `getSpouses`). Returns each requested relative category as person objects keyed by ID — this is the single most useful call for "does WikiTree know about people not in this user's tree."
- **`getAncestors`** — `depth` parameter controls generations (1 = parents, 2 = + grandparents, etc.), returned as a **flat list** of person objects with `Mother`/`Father` ID pointers, not a nested structure — Witness's own graph code would need to assemble the tree from those pointers, same as it already does for GEDCOM.
- **`getDescendants`** — same shape as ancestors, forward direction.
- **`searchPerson`** — the only way to find a profile *without* already having an ID. Takes name, gender, birth/death dates + location, parents' names, with tunable fuzziness (`dateSpread` of 1–20 years, `centuryTypo` toggle, surname-matching strictness). Returns **multiple ranked candidates**, not a single match (e.g. a "Sam Clemens" search returned 10 of 164 possible hits) — this is a disambiguation UI problem, not a lookup.

## The "starting ID" problem

This is the same shape of problem the NARA notes already worked through for record-matching, just applied to whole profiles instead of documents:

1. **Best case:** a user's GEDCOM export already carries a WikiTree ID for some individuals (some desktop programs support a `_WIKITREE` custom tag on export, not universal). Then this is a direct lookup — no fuzzy matching needed at all, same pattern as the existing `ancestryPersonUrl`/`_FSFTID` handling in `apps/mobile/src/lib/ancestry.ts`.
2. **Fallback case:** no ID in the GEDCOM, so `searchPerson` returns a candidate list that needs the same kind of confidence-tiering the NARA notes proposed (name + date-window + place match = high; surname-only = weak) — except here a wrong "match" doesn't just mislabel a document, it could pull in a whole branch of the wrong family. Any auto-accept above "weak" should be resisted; this reads as pick-and-confirm UI, not silent merge.

## Potential fit for Witness

1. **Deep-link button, same tier as Ancestry/FamilySearch** — trivial if a WikiTree ID is present in the GEDCOM; extends `providerPersonLink` with a third branch. Zero risk, immediate value, ships fast.
2. **Gap-filling enrichment (the more interesting case)** — for confidently-matched profiles, `getRelatives`/`getAncestors` could surface relatives missing from the user's own tree as a "curiosity," consistent with the existing "curiosities not verdicts" framing rather than a silent auto-merge.
3. **Not a good fit for the historical-color use case** DPLA covers — WikiTree profiles are genealogical data (names, dates, relationships), not narrative/period material. This is a NARA-style structured-match problem, not a DPLA-style ambient-context one.

## Recommendation

Worth a cheap hands-on spike before any pipeline work, same approach as NARA/DPLA:

- Register an `appId` (self-serve, no wait) and manually query a handful of Howe/Field validation individuals via `getProfile`/`searchPerson` — see how often people in hand actually have a WikiTree profile, and how clean `searchPerson`'s candidate lists are for common surnames.
- In parallel, resolve the licensing question directly against wikitree.com's terms (not reachable from this environment) before deciding whether matched data can be cached in Supabase or must be treated as fetch-on-view like NARA's.
- If hit-rate and match quality look reasonable, the deep-link case (#1 above) is close to free and could ship independently of the harder gap-filling case (#2), which should go through the same confidence-tier UI discipline as NARA.
