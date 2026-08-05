# FSV — Continuation Prompt · rev. 3
*Paste everything below this line into Claude Code from the directory containing the attached files. — G.*

---

You are picking up Family Street View (FSV), a feature of the shipped Witness genealogy app (React Native/Expo, live on the App Store). FSV turns a GEDCOM file into one continuous walkable world — a field of real households where position encodes time, evidence bands render as architecture and atmosphere, and the record's actual stories are staged as playable chapters at the real household sites. The canonical reference implementation exists and works: `08_02_2026_demo.html` ("Howe / Field — Family Street View") — the build the developer most recently walked. The expected audience is 55+ iPad users; readability, accessibility, and wayfinding are product requirements on par with the atmosphere itself. Your job is to industrialize the canonical experience and fold the project's component R&D into it, without losing what makes it good.

## 0. Before writing any code: inventory and report

Read, in this order:
1. `FSV_PROJECT_BRIEF_2026-08-04.md` — current state, settled decisions, the audience, vocabulary. Authoritative over any older document.
2. **`08_02_2026_demo.html`** — the canonical demo. Read the source top to bottom: the embedded household layout (`RAW`), the bands, the culture cells, the `CHAPTERS` array with its beats, keepsakes, figures, and honesty tags, the travel/chapter state machine, the music system. This file defines the product.
3. `FSV_REBUILD_SPEC.md` — repo architecture, test strategy, caching design. Authoritative for structure.
4. The component library: `gedcom_discovery.py`, `scrivener.py`, the narrative director, `build_game.py`, `lantern_template.html`, `architecture_module.js`, `test_playthrough.js`, plus the four built family games and `lantern-districts.html` as proof they run under gates.
5. The reference builds: `the-long-field.html` (the quality bar for chapter interiors and prose) and `howe_field.html` (the settlement generator ancestor). *(The Long Errand refinement build has been cut from the project — if a copy surfaces, do not use it as reference.)*
6. GEDCOM fixtures: `Howe_Field_Family_Tree.ged` (5,495 individuals / 1,852 families), `atani.ged`, plus synthetic and pathological fixtures if present.
7. `FSV_IMMERSION_CATALOGUE_2026-08-04.md` — the feel-layer element library. Immersion work runs through that document's own session protocol (its preamble plus one to three chosen entries), under the same gates, interleaved between milestones as Greg directs — it is not a milestone to bulk-implement.

Then produce an inventory report: what is present, what is missing from the expected list, and each file's role in your own words. **Stop and ask before proceeding if anything load-bearing is missing.** Do not guess at absent files' contents.

## 1. Ground rules — non-negotiable, learned the hard way

Engineering:
- **Tests must drive the real loop.** The worst class of bug in this project's history came from harnesses calling inner functions directly, stubbed timers, and clocks that never advanced — hiding real-time control-flow bugs across three builds. Any playthrough test drives the actual frame loop with a virtual clock.
- **No silent failure, ever.** A build script once swallowed a Python `NameError` and shipped stale output; string patches once no-op'd while reporting success. In the repo era: builds fail loudly on any exception, and every task ends by *running the gate suite and showing its output verbatim*. Never report success without gate output in hand.
- **Small verified increments.** One concern per commit. Gates after every increment, not at the end.
- **Reference implementations are read-only.** `08_02_2026_demo.html`, `the-long-field.html`, and `howe_field.html` stay untouched and runnable forever. You industrialize copies; you never "improve" the references.

Design guardrails (product decisions, not suggestions):
- **The product is the continuous world.** Chapters live *inside* the field at real household sites, reached on foot. Do not restructure the experience into discrete loading-screen scenes; the Lantern scene-game container is a component source, not a target.
- **The audience is 55+ iPad users.** Large legible type, generous tap targets, high-contrast text surfaces, comfortable camera motion, and wayfinding a first-time user never has to puzzle over. **Accessibility and atmosphere are co-equal hard requirements; neither is ever traded for the other.**
- **Facts are never invented.** Every player-facing detail carries its status: From the record / Inferred / Period typical. The place resolver reports its guesses; it never makes them silently — one silently "corrected" word once moved the founder of the American line across an ocean.
- **The model never invents objects.** Objects come from the curated, sourced library; generation *selects and arranges*. Set decorator with a prop house, not a novelist.
- **Bands are the terrain.** Documented / partial / lost / living render as architecture, plainness, fog, and withholding. Missing data is atmosphere, never an error state or placeholder text.
- **The living band stays withheld.** Living households appear with no names and no places. Product requirement, with tests.
- **Figures** exist only as authored, named, period-dressed, scripted characters inside chapters. No realism attempts, no generic crowds.
- **Flat-matte, no textures.** The aesthetic and the memory strategy in one decision. Do not reintroduce texture maps or PBR.
- **Placement, precisely:** interiors use authored room plans with the OBB collision audit — there is no general interior furniture solver, on purpose. Field-scale placement (vegetation, yard dressing, terrain features) is a different, open system and part of Milestone 4.
- **Never cache generated geometry (stage 3).** Cache stage 1 (parse/resolve/score/layout, ~402 KB) and stage 2 (grading, lines of descent) at upload; regenerate geometry client-side in batches. Room cache keys are the *cell* — (region, period, class, trade, household composition) — never the individual. Individual-keyed caching is correct only for biography-like content (and, later, portraits).
- **World stability:** store the year→radius curve; freeze existing plots when new people arrive. Adding a branch must not move the streets.
- **Don't strip the soul in refactors.** The Sexton's three-beat reveals, the keepsakes, The Family Book, the honesty tags, and the tone-keyed score are load-bearing product, not decorative content.
- three.js stays (r128 across everything). A version bump is a deliberate, gated task of its own, never a drive-by.

## 2. Milestone 1 — Stand up the monorepo and industrialize the demo lineage

Scaffold per `FSV_REBUILD_SPEC.md` §5:

```
fsv/
  packages/
    gedcom/          parse → normalised model. No rendering. Pure functions.
      fixtures/      howe-field.ged, atani.ged, synthetic.ged, pathological.ged
    model/           households, evidence scoring, bands, cells, cycle + chronology detection
    profiles/        the cultural data layer, including references to pre-made library assets. No code.
    forms/           parametric geometry. No culture.
    layout/          composition + the audit. Pure geometry, fully unit-testable.
    site/            FFE, platforms, terrain, water, corridors, grading
    render/          three.js. The only package that imports three.
    app/             camera rigs, transit, chapters, UI, accessibility
  apps/
    web/             Vite build
  docs/
  tools/
    pipeline/        the component library (Python + JS), migrated as-is
```

Migration policy: **make it work in the new house before renovating it.** The demo's systems — field generation from the cached layout, bands and culture cells, the chapter state machine, travel, figures, music, journal — become the seed of the packages and `apps/web`. The component library moves into `tools/pipeline/` intact and keeps producing the four family games (its gates stay green as a canary).

Build the world gate suite before changing behavior, one command (`make gates`) running all of it:
- a headless **seven-chapter playthrough of the industrialized world driving the real loop** with a virtual clock;
- the writing gate applied to all chapter text;
- a NaN sweep across all meshes;
- living-band withholding assertions;
- a geometry-batching / peak-memory guard and the insertion-stability test;
- **accessibility statics:** minimum UI type sizes, tap targets at or above Apple's 44 pt minimum (target larger), contrast checks on every text surface (cards, letterboxes, HUD — text never floats unbacked over busy scenes), and the presence of a persistent wayfinding affordance;
- the component library's own gates, plus the §9 pathology fixtures as permanent tests.

**Done when:** the repo builds clean from scratch; the industrialized world runs from the real GEDCOM through cached stages 1–2 and matches the canonical demo chapter for chapter; `gates` runs green end-to-end; the report shows the gate output.

## 3. Milestone 2 — Harvest the Scrivener into the world's chapters

Bring `scrivener.py`'s fact-mining composition and the writing gate to the world's chapter text, so beats, journal entries, and reveals are generated from the record at the standard of the hand-written demo — and so future chapters (Milestone 3) inherit that voice automatically. `the-long-field.html` is the quality bar; the canonical demo's existing chapter text is the regression baseline (it should pass the gate as-is, or the gate is miscalibrated — fix the gate, not the text).

**Done when:** all chapter text in the industrialized world passes the writing gate; a side-by-side of one generated chapter's prose against its demo original reads at par or better; gates green.

## 4. Milestone 3 — Harvest discovery + director toward found chapters

Run `gedcom_discovery.py`'s detectors and the narrative director against the world's data layer to *propose* chapter candidates — site, era, tone, the facts a Scrivener chapter would mine. Stage at least two detector-found chapters in the field alongside the seven authored ones, clearly marked as generated.

This bears directly on the open V2/V3 question — whether auto-detected chapters can reach hand-authored quality (V2) or FSV ships hand-authored flagships on a generative shell. **Collect the evidence; do not conclude it.** Report a side-by-side of a found chapter against an authored one and surface the judgment to Greg and Rufus.

**Done when:** GEDCOM → detected candidates → staged in-world chapters runs under gates on the Howe/Field file and at least one other family's file; the comparison report exists in `docs/`.

## 5. Milestone 4 — World fabric: terrain, water, vegetation, architecture

This milestone builds the physical richness of the field — and it runs alongside Greg's active design week on exactly these subjects. Your job is to build the *seams* and supply the *evidence*; the aesthetic calls are Greg's. Concretely:

**Terrain and landforms.** A heightfield/terrain module in `site` with authorable landform controls, integrated with the existing grading rules (finished floor elevations, platform logic, corridor gradient limits). Nothing about the current field's stability may regress.

**Water and rivers.** A water primitive under flat-matte, and rivers as terrain-following graded features that respect the site logic (crossings, banks, no platform violations). Build it so a river's path can be either naturalistic or authored — the meaning question (the demo's last chapter calls the family lines *rivers*) is a design decision to leave open, not foreclose.

**Vegetation.** An instancing/scatter system that can consume *either* procedural generators *or* pre-made library assets, with placement driven by era/region profiles (species and density are cultural data, like everything else in profiles).

**Library-asset format.** A clean format by which pre-made pieces (vegetation species, furniture, hero set pieces, landmarks) are authored once and referenced from profiles — so the settled prop-house principle (curate offline; the system selects and arranges) extends from objects to the whole world fabric.

**The architecture harvest.** Fold `architecture_module.js`'s materials, construction kit, era districts, Québec/Acadian variant, landmarks, and yard dressing into the field's building cultures — under flat-matte, the budgets, and the draw-call discipline. Interiors follow the settled model (authored plans + OBB audit, walls as solids with real voids, slots filled by culture). Extend the architecture gate over everything added: plans pass the audit with zero violations, every material resolves, no NaN, doors and hearths reachable, landmarks visible from their districts (they are the wayfinding system).

**The procedural-vs-library evidence.** For each category — landform, water treatment, vegetation, furniture/objects, hero pieces — produce a short memo in `docs/` with measured numbers: aesthetic ceiling (worked example each way, screenshots), variety at scale, memory and draw-call cost, and authoring throughput (how much of Greg's time per usable asset). Working hypothesis to test, not presume: macro landform procedural; rivers procedural paths with stylized treatment; vegetation as a pre-made species library procedurally scattered; furniture/objects pre-made and arranged; landmarks and heroes pre-made. **Engineering supplies the data; Greg decides.**

**Done when:** terrain, water, and vegetation systems exist with one worked example each (both procedural and library-fed where applicable); the field's documented households render with period building culture at Long Field quality; all gates green; budgets held; the evidence memo and a before/after of one district exist in `docs/`.

## 6. Milestone 5 — Device truth, for the actual audience

Everything to date is headless; nothing has been seen on glass. Produce builds Rufus can open on an actual iPad; verify visuals and framerate; implement dynamic resolution scaling by frame time and confirm it engages; log frame-time distributions.

Then verify for the 55+ audience specifically: type legible at arm's length at default settings; every interactive element hittable without precision; contrast on all text surfaces in bright-room conditions; camera motion comfortable (no head-bob, adjustable look sensitivity; evaluate a tap-to-walk-to option as an alternative to the joystick); and a wayfinding trial — can a first-time user find the next chapter unaided, using only the landmarks, roads, and the Sexton. Fix what the device reveals — under gates.

**Done when:** the industrialized world runs on-device at acceptable framerate with the touch controls, the audience checks pass, and a device report exists in `docs/`.

## 7. Milestone 6 — Witness integration spike

The fork is closed: FSV lives inside Witness. Spike the seam, don't productionize it:
- Embed the built runtime in the Expo app via WebView; define the message bridge (Witness hands across the stage-1/stage-2 cached data as JSON; the runtime reports chapter progress and research-quest events back for the Research tab).
- Entry concept: from Family Stage — the existing 2D household time-scrubber — into the field. Family Stage is the rehearsal; FSV is the same mental model given space.
- Respect the caching design: stages 1–2 computed and cached at GEDCOM upload on the app side; stage 3 always regenerated in the WebView client, batched.

**Done when:** a demo build of Witness (or a minimal Expo host) opens the field from real handed-across data, and a one-page integration memo in `docs/` records the bridge contract and any Expo/WebView constraints discovered.

## 8. Milestone 7 — Formalize the privacy layer

The canonical demo already withholds the living band diegetically — living households stand nameless and placeless, and the final chapter ends where the record falls silent. Turn that into stated, tested policy: exactly what renders and what is withheld for living and recently-living people, how the boundary is decided from the data, and gate assertions that fail any build leaking a living person's name, place, or dates anywhere — geometry labels, journal, chapter text, debug output.

**Done when:** the policy doc exists in `docs/`, the assertions are in the gate suite, and both real-file builds pass.

## 9. Milestone 8 — Exploratory spike, behind flags: portraits, conversations, home base

These are design-in-progress, from Greg. Build behind feature flags; nothing user-visible ships without his sign-off.

**Token-generated portraits.** Period-style *painted impressions* of family members — never presented as likenesses — each carrying its honesty tag. Cached per individual: this is biography-like content, so it rides Witness's existing individual-keyed `enrichment_cache` pattern (the one place individual keying is correct). Generated offline at upload time alongside stages 1–2, never live in the render loop.

**Token-generated conversations.** Dialogue with chapter figures bounded entirely by the record, under full Scrivener discipline and the writing gate applied to dialogue: facts mined, voice period-and-personal, restraint at the gravest moments, nothing invented. Where the record is silent, the ancestor honestly cannot answer — and that refusal is surfaced as a research-quest hook, not an error.

**Home base.** A persistent, customizable interior — a natural anchor is the player's own household in the field — displaying keepsakes, rewards, and portraits at a glance. Evaluate it explicitly as a wayfinding device for the 55+ audience (a fixed, familiar point the player can always return to and orient from), not only as a trophy room.

**Done when:** each exists behind a flag with its gates (honesty tags on all generated content; the dialogue writing gate; no living-band leakage through portraits or dialogue), and a short evaluation with screenshots exists in `docs/` for Greg's review.

## 10. Permanent test fixtures — the real world, encoded

From the actual Howe/Field file; these, or synthetic equivalents, stay in the suite forever:
- 43 chronological impossibilities → detected and flagged in the model layer; nothing downstream crashes or silently "fixes" dates.
- 22 individuals recorded only as `?` → unnamed presence and atmosphere, never literal "?" labels or invented names.
- Second NAME records used as disambiguators (not epithets) → parsed accordingly.
- 341 doorways to households with no interior → graceful degradation: far-room atmosphere with nothing behind it is acceptable; a broken portal is not.
- The 297 MB geometry ceiling → batched generation with a peak-memory assertion.
- Insertion stability → adding a 500-person branch to a fixture moves no existing plot.
- Living-band withholding → a build that prints or renders a living person's name fails.

## 11. Reporting format

After each milestone: what changed, gate output verbatim, anything you were tempted to do but didn't (and why), and open questions for Greg and Rufus. The V2/V3 evidence from Milestone 3 and the procedural-vs-library evidence from Milestone 4 are surfaced, never decided unilaterally.

## 12. Do not

Do not reopen closed questions (standalone app, AI-static images for the world, realistic figures, interior placement solvers, textures, caching stage 3, the scene-game as product format). Do not invent facts, objects, or place-name resolutions. Do not modify the reference implementations. Do not restructure the world into discrete scenes. Do not strip the Sexton, keepsakes, journal, honesty tags, or tone-keyed score during refactors. Do not render or print anything from the living band. Do not trade readability for atmosphere, or atmosphere for readability. Do not ship generated portraits or dialogue without honesty tags, gates, and Greg's sign-off. Do not upgrade three.js in passing. Do not let any script swallow an exception. Do not report success without gate output. Do not start Milestone N+1 with Milestone N's gates red.

Begin with the §0 inventory report.
