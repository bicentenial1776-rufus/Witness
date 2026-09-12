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

## Empirical findings (2026-09-12 test)

Rufus supplied a known WikiTree ID (`Howe-11735`, his own profile) and ran `getProfile` with `fields=*` by hand. This environment can't call the API directly — `wikitree.com` and `api.wikitree.com` are both blocked by network egress policy here, confirmed via WebFetch and curl against both hosts — so this was a manual round-trip: Rufus ran the request, pasted back the raw JSON.

- **`getProfile` already nests one hop of relatives, no `getRelatives` call needed.** The response's `Father`/`Mother` fields are raw IDs, but a `Parents` object also came back keyed by those same IDs with each parent's *full* profile (bio, dates, sources) attached — plus empty `Children`/`Siblings` arrays. This isn't obvious from the docs alone, which describe `getRelatives` as the call for pulling in relative profiles.
- **Response shape:** a top-level JSON *array* with one `{page_name, profile, status}` object per requested key — worth remembering when writing a parser, since a single-key request still comes back wrapped in an array.
- **`IsLiving` is exactly the signal Witness's living-person rule needs.** Rufus's own profile (`IsLiving:1`) had its biography auto-suppressed by WikiTree itself ("The biography for Rufus Howe is empty. What can you add?"), while his late father's and mother's profiles (`IsLiving:0`) carried full biographies. A WikiTree-matched profile could drive Witness's redaction directly off this flag rather than re-deriving living/deceased status.
- **The bios are real sourced narrative, not just vital-stats fields** — his father's profile cites a WWII draft card, three census years, a military service record, and a marriage record, woven into prose. Confirms the "gap-filling" potential from the earlier section with an actual example rather than a hypothesis.
- **Concrete integration point found: Find a Grave.** Both parents' bios end with a "See also" citation to a Find a Grave memorial URL (e.g. `https://www.findagrave.com/memorial/72760811/shirley-scott-howe: accessed 05 December 2022`). Traced against `apps/mobile/src/lib/grave-link.ts`'s existing `extractFindAGraveUrl()` regex — it correctly pulls the clean memorial URL out of that exact citation format (including stripping the trailing colon before "accessed"). Since that function already exists to parse user-pasted Find a Grave text, a matched WikiTree profile's bio could feed it the same way — surfacing a grave-confirmation candidate for the user to confirm, without Witness ever touching findagrave.com itself (the citation text comes from WikiTree's API response, not from scraping Find a Grave), consistent with that file's existing "we store only what the user personally confirms" design.
- **Still unresolved:** this test started from an ID Rufus already knew and typed in by hand. It says nothing about whether Witness could ever *discover* that ID starting from a GEDCOM alone — the core open problem in the "starting ID" section above still stands untested.

## Onboarding assessment: could a new user import via WikiTree instead of GEDCOM?

The question this section answers: could WikiTree be a *front-door* onboarding path — "connect your WikiTree account" as an alternative to uploading a GEDCOM — rather than just an enrichment source for users who already imported one. Conclusion: this would be a genuinely separate onboarding flow, not a variant of the existing importer, for three reasons:

1. **Auth is a real gap, not a detail.** Public profile reads need nothing, but pulling a user's own fuller tree — including anything privacy-restricted, and the "am I even a member" question generally — needs `clientLogin` against WikiTree's own username/password. That means an actual "log in to WikiTree" screen and credential/session handling. Nothing in Witness's current onboarding does third-party auth at all; GEDCOM upload is just a file.
2. **Assembly, not parsing.** A GEDCOM file hands the importer the whole graph in one shot (`src/app/(app)/import.tsx` → `packages/core/src/supabase/import.ts`). WikiTree hands back fragments — one call for ancestors, another for descendants, another for siblings/spouses — that would have to be recursively fetched and stitched together into the same internal tree shape. That's a new adapter parallel to `packages/core/src/gedcom/`, not a tweak to the existing importer.
3. **The audience question matters more than the engineering.** WikiTree's whole model is a single shared tree built by committed, longtime hobbyists who already publish openly. A brand-new prospective Witness user — someone curious about their family, not already a genealogy-community regular — is far less likely to have a WikiTree presence than an Ancestry or FamilySearch one. So even fully built, this onboarding path is narrower than the file-upload one Witness already has.

**Recommendation:** treat WikiTree-as-onboarding as a possible *secondary* "connect an account" option later — worth it specifically if targeting WikiTree's niche as an acquisition channel — rather than a front-door flow. It's a smaller, different bet than the gap-filling/enrichment case above, which serves existing GEDCOM-imported users instead of trying to replace their entry point, and doesn't require solving the auth/assembly problems at all.
