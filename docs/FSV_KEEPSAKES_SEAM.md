# FSV keepsakes — the seam, 2026-09-19

Greg's list of what the picture integration needed from Witness (19
September), and where each stands.

| Ask | Status |
|---|---|
| DPLA key in the function secrets as `DPLA_API_KEY`, not in the env file that ships in the app | **Already so** since 2026-08-25. The secret is set on the project (every story arc of the last eight days carries a DPLA scene made with it). The app bundle only ever inlines `EXPO_PUBLIC_*` variables; the key in the developers' local `.env` files is not one of them, and those files are git-ignored. Nothing to change. |
| Chronicling America client off the retired host | **Already so** since 2026-09-13 (commit 7aca318). `_shared/history-sources.ts`, `obituary-leads` and `generate-story-arc` all use `loc.gov/collections/chronicling-america/?fo=json`, images off `tile.loc.gov`. The design repo's source documents of 27–30 August predate the move. |
| Digital Commonwealth in the source list | **Done** in `fsv-keepsakes`: keyless `search.json` and keyless IIIF (`iiif.digitalcommonwealth.org/iiif/2/<exemplary_image_ssi>/full/!1200,1200/0/default.jpg`), asked first for New England towns for `place` and `papers`. |
| A way to read the household's own photographs | **Done**: `fsvHouseholdPortraits` in `packages/core/src/fsv/keepsakes.ts` — media linked to the household's members, image formats only, complete uploads only, primary first, at most three a person and twelve a household, signed from `tree-media` for an hour. Empty for a living household. |
| `fsv-keepsakes`, cached by kind, place and decade, one call every two seconds per host | **Done**: `supabase/functions/fsv-keepsakes`, table `fsv_keepsake_cache` (migration `20260919220000`), slot table `fsv_source_ticks` for the two-second rule across every running copy. |

## What the room page receives

The app posts into the frame, as before:

```json
{ "type": "fsv-household", "record": { ...FsvHouseholdRecord }, "day": 0, "keepsakes": { ... } }
```

`keepsakes` is present when the app already has them; otherwise a second
message follows as soon as they arrive (news from loc.gov can take
thirty seconds; the room must not wait for it):

```json
{ "type": "fsv-keepsakes", "keepsakes": {
    "portrait": [ { "pid": "<individual id>", "url": "<signed, 1 h>", "title": "…", "primary": true } ],
    "news":     [ { "title": "The Watertown Enterprise", "date": "1885-06-12", "image": "…", "thumb": "…", "url": "…", "provider": "Library of Congress, Chronicling America", "note": "from the time" } ],
    "place":    [ { …same shape… } ],
    "papers":   [ { …same shape… } ]
} }
```

`portrait` is always present (possibly empty). `news`, `place` and
`papers` are absent when the function could not answer in time and empty
when it answered with nothing. Items are ordered as the sources ranked
them; `image` is sized for a picture surface (≤1200 px on the long side),
`thumb` for a tag (≤400 px). `pid` matches `record.persons` and
`record.members`.

The `record` and `letters` kinds are the page's own from the record and
the file's notes; the app sends nothing for them yet.

## The function

```
POST /functions/v1/fsv-keepsakes        (caller's JWT)
{ "kind": "news" | "place" | "papers", "town": "Watertown", "state": "Massachusetts", "county": "Middlesex", "year": 1885 }
→ { "kind", "place": { "town", "state", "country" }, "decade": 1880, "items": [ … ], "cached": true, "fetched_at": "…" }
```

Sources by kind:

- `news` — Library of Congress, Chronicling America (US, 1756–1963), the
  town as query and the state as facet, pages with images only.
- `place` — Digital Commonwealth for New England towns (maps,
  photographs, prints, postcards; the town must be a subject, not a word),
  then DPLA images with the town and state as spatial filters.
- `papers` — Digital Commonwealth by geographic facet plus a word (deed,
  probate, will, inventory): the town in the decade, then the county
  (the registry of deeds and the probate court sat at the county seat),
  then the twenty years around the decade; then DPLA text records. The
  facet matters: a plain word search finds "deed" anywhere in the state
  (Watertown, 1880s: 0 by words, 17 by the Middlesex county facet).
  Measured 2026-09-19: Watertown, Middlesex, 1885 → place 8, news 8,
  papers 8; a cold news call takes ~5 s, place ~1 s, papers ~7–10 s (the
  facet walk); warm answers are one row.

Cache: 180 days when there are items, 7 days when there are none. Two
seconds between calls to any one host, enforced through
`fsv_source_ticks` so parallel invocations queue rather than race. Every
source is optional: a source that fails is logged and skipped.

## What is not done

- The page's side: swapping `KEEP_FACE` materials and the viewer.
- `letters` from `individual_notes`, and `record` from the file: the page
  has the record already; notes are a later read.
- Non-US households: `news` is empty (Chronicling America is US only);
  `place` and `papers` ask DPLA with the town alone.
