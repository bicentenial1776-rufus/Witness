# FSV shell decision — a brief for Rufus and Greg

*2026-08-28. Input to the rebuild-spec §6 decision ("does FSV live inside
Witness or launch as a separate experience?"). This is a recommendation with
its reasoning shown, not a verdict — the call is yours and Greg's. Companion
to `FSV_WITNESS_BRIDGE.md`, which stays true either way.*

## The reframe: it isn't binary

"Inside vs separate" bundles two different questions, and separating them
dissolves most of the argument:

1. **Product**: one account, one subscription, one tree — or a second
   product with its own auth, billing, and import?
2. **Embed depth**: does the renderer run inside the iPad app's process
   (Expo DOM component), or in the browser at a Witness URL?

Question 1 has a clear answer on the merits (below). Question 2 is an
*empirical* question the W6 spike exists to answer — it should not be
decided by argument in August.

## Recommendation

**One product: FSV lives inside Witness.** Concretely:

- **Web-first**: `apps/fsv/` builds with Vite (three.js lives there and only
  there) and ships as static assets on the `app.witnesslives.com` deploy —
  same origin, so the Supabase session and the RevenueCat entitlement gate
  are simply *already there*. No second sign-in, no second import.
- **iPad**: the Witness app opens the same built bundle in an Expo DOM
  component (`ExpoDomWebView` is already in the Pods). Family Stage → field
  entry, as the bridge brief and Greg's W6 roadmap already sketch.
- **Fallback if the spike fails its bar**: full-screen Safari at
  `app.witnesslives.com/field` (or a subdomain) — still the same account,
  data, and subscription. The fallback degrades *embed depth*, never the
  one-product answer.

## Why one product

- **The data is the feature.** Everything FSV renders — TreeIndex, family
  stages, geocoded places, citations-as-evidence, living flags, Sanborn
  editions, the enrichment pattern — is curated inside Witness. A separate
  product needs a second import pipeline or a cross-product API, and GEDCOM
  import is not idempotent; there is no sync path. That's a real
  engineering tax paying for no user benefit.
- **The subscription story.** FSV is the flagship post-launch feature. Inside
  Witness it is the reason to subscribe; separate, it either needs its own
  billing (splitting a small audience across two paywalls) or a
  cross-product entitlement bridge (RevenueCat can, but it's standing
  complexity).
- **Distribution.** No second App Store listing, review cycle, or rating to
  protect. And because the renderer is a *web* bundle even on iPad, FSV
  iterates on web-deploy cadence — Greg ships worlds without waiting for an
  iOS binary. That's faster than a separate native app, not slower.
- **Positioning.** Katie's read: the walkable world is what makes Witness
  unlike a dry pedigree. As a separate app it competes for attention with
  the product it's supposed to sell.
- **The conventions already assume it.** Greg has push access, `apps/fsv/`
  is reserved, the branch/PR conventions and the do-not-touch list exist,
  and the bridge seam (`resolveFsvProgram` → program JSON) was built
  shell-agnostic. Landing inside is the path of least ceremony.

## Why the perf worry is smaller than it looks

The usual reason to flee a WebView is heavy rendering — but Greg's own hard
laws cut the other way: flat-matte, **no textures**, figureless field,
deterministic generation, prop-house rule (no invented geometry). That is a
deliberately light scene graph. The named aesthetic bar (Messenger,
messenger.abeto.co) runs in mobile *browsers* on modest hardware, and
WKWebView's WebGL is Metal-backed — the same engine Safari uses. The 43-config
Playwright gate already exercises stress tiers headlessly.

What a WebView genuinely costs: a jetsam memory ceiling, a JS boundary for
the data bridge, and clumsier profiling. All three are exactly what W7's
real-iPad instrumentation measures.

## The W6/W7 spike bar (proposed — Greg edits)

On Rufus's iPad Air (5th gen, M1), against the Howe/Field corpus
(1,829 placeable households; render the field slice the design calls for,
not all of it at once):

- Settled scene ≥ 50fps; threshold transitions ≥ 30fps, no visible hitching.
- Cold entry from Family Stage ≤ 5s to walkable.
- No WKWebView memory-pressure termination across a 10-minute walk
  (generations of door transitions included).
- Bridge round-trip proven: live tree → `resolveFsvProgram` JSON → world,
  matching the fixture's regression counts.

**Decision rule:** pass → DOM-component embed inside the iPad app. Fail after
honest optimization → browser full-screen at a Witness URL. Either way the
one-product answer stands, engine/asset-pipeline choices unblock now, and
nothing built before the spike is thrown away.

## Out of scope here, but adjacent

- **The rename** (Katie: "Family Street View" reads as literal Street View)
  is orthogonal to the shell but should land before any public copy; inside
  one product it can be a *mode name* rather than a brand, which lowers the
  stakes.
- **Geo mode** (Katie's spatial-proximity ask) is the world bench's
  Groundwork + the W2 biome tool — unaffected by the shell choice.
- **Caching**: the CELL-key rule (region, period, class, trade, composition —
  never per-individual) applies identically under either shell.
