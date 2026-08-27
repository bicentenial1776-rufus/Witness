# FSV ↔ Witness — the bridge brief

*2026-08-27 · Rufus Howe / Claude. For Greg, and for any Claude session working
on FSV. Canonical copy lives in the Witness repo at `docs/FSV_WITNESS_BRIDGE.md`;
a copy rides in `GregSHowe/fsv/docs/`. If the two disagree, the Witness copy wins.*

**How to use this:** in a session inside the `fsv` repo, read this file after
`FSV_HANDOFF_2026-08-09.md` — it tells you what the Witness app already
provides, so nothing in it gets rebuilt. In a session inside the Witness
monorepo, the repo's own `CLAUDE.md`/`AGENTS.md` govern; this file adds the
FSV-specific seam and the merge conventions at the bottom.

---

## 1. The one-paragraph orientation

Witness (this repo: `bicentenial1776-rufus/Witness`) is a shipping
Expo/React-Native + web app with a Supabase backend. It already parses real
GEDCOMs, geocodes places, models households, precomputes relationships, scores
what the record documents, and caches AI enrichment — most of FSV's
**stage 1 (resolve)** inputs exist here as tested, production-hardened code.
FSV's rebuild spec says "throw away my GEDCOM parser — real files are far
worse than it assumes." The replacement is this repo. Do not re-derive any of
the below inside `fsv`; consume it.

## 2. What Witness already provides, mapped to the FSV pipeline

All paths are monorepo paths. `@witness/core` is `packages/core` (TypeScript,
built to `dist/` — run `npm run build` in `packages/core` after touching it, or
the app's typecheck fails on missing exports).

| FSV need (rebuild spec / Groundwork) | Already built in Witness | Where |
|---|---|---|
| **Parse the file** (stage 1) | Battle-tested GEDCOM parser → `ParsedGedcom` (Ancestry + FamilySearch exports, the real-world pathology) | `packages/core/src/gedcom/` — `parseGedcom(text)` |
| **The whole tree, client-side** | `TreeIndex`: individuals, families, events, places in one structure — built from a parse (`buildTreeIndexFromParsed`) or fetched from the DB (`fetchTreeIndex`). The app already caches it on device as the offline "field copy". This is the natural input to FSV resolve. | `packages/core/src/query/treeIndex.ts`; app cache `apps/mobile/src/lib/tree-index-cache.ts` |
| **Households = buildings** | `buildFamilyStages(index)` → `FamilyStageIndex`: every stage-able household with head, marriages, children, dated spans, `hasLiving`. Stage keys are stable (the head's id) — use them as FSV parcel/household ids so the two worlds address the same units. | `packages/core/src/query/familyStage.ts`; `stageKeyForPerson()` |
| **Real coordinates** | `places` rows carry `latitude/longitude` from a geocoding pipeline (pg_cron + Nominatim, reuse-on-import). `GeographyIndex` + `classifyPlace(parts)` → country/state/region — the inputs your biome tool (lat/long/year → biome) and culture channel need. | `packages/core/src/query/geography.ts`, `regions.ts` |
| **Lines of descent** (stage 2) | Precomputed `relationships` table (label, tier, path of ids per person vs the home person) + `getRelationshipPath(client, treeId, individualId, fromPersonId?)` for arbitrary anchors. Story-arc descent chains exist too (`generate-story-arc` edge fn). | `packages/core/src/family/queries.ts` |
| **Evidence scoring** | Per-person `citations` (fact, source, excerpt, url) joined to `sources`; `individual_events` with dated, placed events; documented-vs-probable confidence rules in `aliveDuring.ts`. Your documented / period_typical / inferred bands should *derive* from these counts, not from a parallel scorer. | tables `citations`, `sources`, `individual_events`; `packages/core/src/query/aliveDuring.ts` |
| **The living band, withheld** | `individuals.living` is authoritative and the house doctrine already enforces it: living people never enter AI prompts, shares, or stories. FSV's "living band withheld" is the same law — read the flag, don't re-infer it. | everywhere; see `apps/mobile/AGENTS.md` |
| **Vignette text** | AI enrichment via Supabase edge functions with a cache-first pattern (`enrichment_cache`, keyed `(individual_id, enrichment_type, prompt_version)`); disclosure lines are house style. **Rooms must NOT use this key** — per your rebuild spec, room-scene descriptions cache by CELL `(region, period, class, trade, household composition)`. That's a new table + edge fn following the existing pattern in `supabase/functions/generate-biography/`. | `supabase/functions/`, `apps/mobile/src/app/(app)/ancestor/[id].tsx` (`useEnrichment`) |
| **Real town maps** | `sanborn-lookup` edge fn: `{city, state, year}` → LOC Sanborn fire-insurance map editions, cached 180 days. Ground truth for street layout in the geographic mode. | `supabase/functions/sanborn-lookup/` |
| **The entry point** | The Family Stage screen (`/family-stage/[key]`) is the ratified door into FSV per your roadmap W6: "Family Stage → field entry." The Portrait, Home's "Family graph of the day," and the register all route to it already. | `apps/mobile/src/app/(app)/family-stage/[key].tsx` |
| **The fixture** | The real Howe/Field export (5,495 people / 1,829 placeable households — the corpus your specs cite) is checked in. Also `sample.ged`, `sample7.ged`. | `packages/core/fixtures/Howe_Field Family Tree.ged` |
| **Determinism** | Date-seeded deterministic picks (`pickWeekly` — FNV-1a over a seed string) are the house pattern; same seed → same result on every device, matching your same-file-same-seed law. | `packages/core/src/findings/index.ts` |

## 3. The seam (works under either answer to "inside vs separate")

The inside-Witness-vs-separate-experience decision (rebuild spec §6) is still
open. **The bridge below is identical either way — build it first, argue the
shell later.**

```
Witness (has)                      the bridge (build this)             FSV (has)
─────────────                      ───────────────────────            ─────────
TreeIndex ─┐
FamilyStageIndex ─┤                packages/core/src/fsv/             PROGRAM stage of
places lat/lng ─┼──► resolveFsvProgram(index, …) ──► JSON ──►         Groundwork:
citations counts ─┤                pure functions, unit-tested,       demand schedule,
living flags ─┘                    no three.js, no react              parcels, evidence bands
```

- The bridge is **pure data → data**: one function family in
  `packages/core/src/fsv/` that turns a `TreeIndex` (+ stages + citations
  counts) into FSV's stage-1 "program" JSON — the settlement demand schedule
  with evidence bands, culture/geography inputs, and stable household ids.
  Cache-friendly (stages 1–2 cacheable at import; stage 3 never, per your
  spec).
- FSV's world bench then consumes that JSON instead of parsing GEDCOMs itself.
  Same contract whether the renderer ends up in an Expo DOM component, a
  WebView, or a separate app.
- If the answer lands **inside Witness**: Expo SDK 57 is on board and DOM
  components (`'use dom'`) are compiled into the binary (`ExpoDomWebView` is
  in the Pods) — a three.js world in a DOM component is the probe to run in
  the W6 spike. `react-native-webview` is *not* currently a dependency; prefer
  DOM components before adding it.

## 4. Merging into the Witness main branch — the conventions

Greg already has **push access** to `bicentenial1776-rufus/Witness`. The
workspace globs (`apps/*`, `packages/*`) mean a new app folder joins the
monorepo automatically.

**Where FSV code lives:**
- `apps/fsv/` — the FSV app/bench code (Vite + three.js live HERE and only
  here; the mobile app must never import three.js directly).
- `packages/core/src/fsv/` — the bridge: pure functions + tests, no rendering.
- `GregSHowe/fsv` stays the **design repo** — specs, catalogues, benches,
  panel studies. Code graduates from there into `apps/fsv/` when it's headed
  for the product; the design record never has to.
- `apps/streetview-lab/` is the superseded Aug-3 experiment — ignore it (it
  will be removed).

**The workflow (please hold to it — the repo has no branch protection, only
convention):**
1. Branch from fresh `main`: `git checkout -b fsv/<topic>` (e.g.
   `fsv/bridge-program-json`, `fsv/bench-import`).
2. Keep each PR one topic. The first three, suggested:
   **(a)** scaffold `apps/fsv/` (package.json, Vite build, README) —
   deterministic build, no `Date.now()`/`Math.random()` in generation paths;
   **(b)** the bridge: `resolveFsvProgram` over the Howe/Field fixture with
   asserted counts (1,829 households, 0 cycles — your regression numbers);
   **(c)** the W6 integration spike behind a flag (a hidden route, not a tab).
3. Before opening the PR: `npx tsc --noEmit` in `apps/mobile` (the whole
   monorepo typechecks through it), `npx vitest run` in `packages/core`, and
   `npm run build` in `packages/core` if you touched it.
4. Open a PR to `main` — never push to `main` directly. Rufus (with Claude)
   reviews; expect the review to run the code, not just read it. Mention
   `@bicentenial1776-rufus` when it's ready.
5. Things not to touch without a conversation first: `apps/mobile/` outside
   the integration spike, `supabase/migrations/` (Rufus runs the deploy side),
   dependency versions in `apps/mobile/package.json` (`expo-camera` is pinned
   `57.0.0` deliberately), and anything under `apps/preview-site/`.

**House rules that apply to FSV code the moment it enters this repo** (full
text in `apps/mobile/AGENTS.md`):
- Tree-scoped tables always filter by `tree_id` — RLS is per-user, not
  per-tree.
- Nothing shareable ever includes a living person; unknown death ≠ living.
- One visual system for UI chrome (letterpress tokens, 12px floor, mono for
  record data). The 3D world is Greg's aesthetic domain; the buttons around
  it are the app's.
- Honesty tags carry over both ways: Witness already labels AI text and
  probable lives; FSV's documented/period_typical/inferred bands should read
  as the same vocabulary to the user.

## 5. What the Witness side owes FSV (Rufus/Claude's queue)

- The **inside-vs-separate ruling** (blocking, rebuild spec §6) — decision memo
  on request.
- A `resolveFsvProgram` contract review once Greg drafts the JSON shape.
- The cell-keyed room cache table + edge fn when the vignette track starts.
- iPad instrumentation time in W7 (real device, Release build — the recipe is
  proven).

*Questions → Rufus. Repo questions in a PR are better than questions in text:
the answer lands where the next session can find it.*
