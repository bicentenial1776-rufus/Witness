# Family Street View — Project Brief
### Handoff from Greg · August 4, 2026 · rev. 3

**The canonical reference is `08_02_2026_demo.html`.** Its own title bar reads *Howe / Field — Family Street View*, and it is the build Rufus most recently walked — the shared reference point between designer and developer. Walk it before reading anything, including this brief. Everything else in the package is either a component source or history; where any document or build disagrees with this file, this file wins. This brief replaces the old `PROJECT_BRIEF.md` entirely — that document describes silhouette figures, back-door exits, and an unresolved platform question, none of which survived.

---

## 1. What FSV is — as the demo shows it

A GEDCOM file becomes a walkable place, and the record's real stories are waiting inside it.

**The field.** One continuous world built from the actual Howe/Field export: 1,829 placeable households laid out so that position encodes time — walking the field is walking the centuries. Every household carries its evidence band and renders accordingly: *documented* houses rise in one of six period building cultures (England hall, colonial hall, federal farm, Québec farm, milltown, postwar); *partial* households stand plainer; *lost* households are fog and shadow; *living* households are present but withheld — no names, no places. Missing data as atmosphere, and the privacy boundary itself, are not features bolted on. They are the terrain.

**The chapters.** Seven authored chapters staged at the real household sites, oldest to newest, reached on foot: *The Parish Before the Crossing* (Great Yarmouth, 1620 — the christening of Rebecca Towne); *The Petition* (Salem, 1644 — thirty-nine neighbours' names that will not save her); *The Innkeeper's Wedding* (Sudbury, Christmas Day 1701 — David Howe and Hepzibah Death, the tavern that becomes the Wayside Inn); *The Sluice* (Port Royal, 1741 — the Acadian dyke, fourteen years before the expulsion); *The Quiet Mending* (Rutland, 1778 — Jonathan Howe marries Lucy Read, whose mother was Hannah Nurse of the Salem line: the hinge of the whole field); *The Mill Floor* (North Brookfield, 1866 — the best-attested marriage in the file, fifty-seven citations); and *Where the Rivers Meet* (a Maine kitchen, 1943 — the English and the Acadian lines arrive in one room, and past that door the record falls silent).

**The mechanics.** Each chapter is a staged scene at the household's actual building — some interiors, some dooryards and mill yards — with named, period-dressed figures (some with walk-to stations), three-beat interactive objects, and a keepsake carried from every era: a christening cloth, a petition page, a tally slate, an aboiteau peg, a worn wedding band, a mill bobbin, a war-issue ration book. A far-off narrator, the Sexton, delivers the turn at the end of each sequence. Every presented detail carries its honesty tag — **From the record / Inferred / Period typical** — and the record's own dates and names anchor every reveal. A journal, The Family Book, keeps what the player has witnessed. Between chapters the player travels the field itself, past everyone else in the file, through day and night, under a live-composed score whose mood follows the chapter tones.

**Product frame (settled).** FSV ships *inside Witness* as a future version — V2/V3 territory. Witness is live (witnesslives, App Store) and its Family Stage feature — pick a household, scrub through time — is the 2D rehearsal for exactly this. The old inside-vs-separate fork is closed.

## 2. The audience — and the standard

**The expected demographic is 55+ iPad users.** Text size, accessibility, and wayfinding are first-class product requirements, not polish: large legible type, generous tap targets, high-contrast text surfaces, comfortable camera motion, and an experience in which a first-time user always knows where they are and where to go next. The wayfinding toolkit already exists in pieces — district landmarks raised on the horizon, the road network, the Sexton's guiding voice, and (under exploration, §7) a home base as a fixed, familiar anchor.

**Equally non-negotiable:** the experience must be rich, atmospheric, and immersive, with the possibility of a thousand unique experiences — every tree its own field, its own found stories, its own weather of evidence and absence. Accessibility and atmosphere are co-equal hard requirements. Neither is ever traded for the other, and the generative components exist precisely so richness scales to arbitrary families rather than being hand-built once.

## 3. How to read everything else in the package

| Artifact | Role |
|---|---|
| **`08_02_2026_demo.html`** | **Canonical.** The intended experience. 4,591 lines, ~654 KB, fully self-contained with the real layout embedded. |
| `howe_field.html` | The procedural settlement generator the demo's field descends from. |
| `the-long-field.html` | Quality study: the writing engine fused with the full period-architecture kit, six hand-authored rooms, 1620–1943. **The bar for chapter interiors and prose** — in a container (discrete scene rooms) that is not the product. |
| `lantern-howe / -rose / -war / -brennan.html`, `lantern-districts.html` | Generative experiments: proof the component tech runs end-to-end on four different families' files under gates. Not the product format. |
| `gedcom_discovery.py`, `scrivener.py`, the narrative director, `build_game.py`, `lantern_template.html`, `architecture_module.js`, test harnesses | The component library — §4. |
| `FSV_REBUILD_SPEC.md` (July 28) | Repo layout, test strategy, caching design. Still the structural blueprint. |
| The Watershed, The Convergence | Sketches (per-person chapter arcs; a musical reading of the data). History. |

The Long Errand refinement build has been **cut from the package** by Greg's call. Earlier prototypes — Three Hills, The Howe Line, The Road of the Ages, the v1–v6 single rooms — are lineage, not reference.

## 4. The component library — built in a tangent, valuable in the product

The Aug 1–4 R&D track built its components inside a scene-game container. **The container is the tangent; the components are not.**

**Discovery engine** (`gedcom_discovery.py`). A forgiving GEDCOM parser, full graph model, and six deterministic detectors — history proximity (gazetteer events, specificity-weighted, victim-signal multiplier), deep lines, convergences, immigrant generations, anomalies, texture. On our file: 4,579 scored candidates, surfacing things nobody hand-picked — Plymouth first-winter deaths in the direct line, a second Salem thread, a seven-generation Orkney matriline, an explicit 1636 crossing. This is the path from *hand-picked chapters in our tree* to *found chapters in anyone's* — the thousand-experiences requirement in code form.

**The Scrivener** (`scrivener.py`) and the writing gate. A fact-mining prose composer enforcing the six principles the best writing taught: specificity as the soul of every sentence; the three-beat reveal — in-world voice, the turn, the consequence vaulting to deep time; the pull-back to long consequence; period-and-personal voice; restraint at the gravest moments; facts never invented. The gate fails any build whose fact beats lack a year or lifespan, whose reveals are missing, or that leaks raw GEDCOM strings to the player.

**Architecture module** (`architecture_module.js`). ~40 named historical materials, a parametric construction kit (wrap-course clapboard, Tudor jetties, fieldstone, brick with granite quoins, seven roof forms, period windows and chimneys), seven era districts plus a place-triggered Québec/Acadian variant, district landmarks and period yard dressing. Richer building culture than the demo's field currently has — and the landmarks double as the wayfinding system for §2's audience.

**The gated headless harness discipline.** Playthroughs through real three.js with a stubbed DOM and a virtual clock driving the *actual* frame loop; a writing gate; an architecture gate; mesh budgets. The discipline, not any single harness file, is the asset.

## 5. Design positions — as embodied in the canonical demo

Missing data is the engagement engine and the terrain: bands render as architecture, fog, and withholding, and the gaps feed research quests that point back at Witness's Research tab. The honesty system governs every word: From the record / Inferred / Period typical; the place resolver reports its guesses instead of making them silently; objects come from a curated, sourced library — the model selects and arranges, it never invents. Figures are authored, named, period-dressed, and scripted, inside chapters only; realism attempts stay dead, and there are no generic crowds. The aesthetic is flat-matte with no textures — chosen for tone, and it dissolved the geometry memory ceiling as a side effect. The living boundary is diegetic: living households stand in the field withheld, and the final chapter ends where "the record falls silent." Sound is a live-composed, non-looping score keyed to chapter tones, gesture-gated, with iPad-first touch throughout. Underneath it all, the three-layer model holds: forms carry no culture, materials are shared, profiles carry all the culture — proven from New England to Québec to Middle-earth.

One clarification on placement: what is closed is a general solver for *interior furniture* — interiors use authored room plans with the OBB collision audit. Field-scale placement (vegetation, yard dressing, terrain features) is a different problem and an open, active design space.

## 6. This week's design front — Greg, working in parallel

Greg's active design work this week, so engineering keeps these seams open rather than deciding them:

**Landforms, water, and rivers.** Refining terrain depiction and introducing water features. Rivers want to be terrain-following graded features that respect the existing site logic (finished floor elevations, corridors, gradient limits). One question to answer deliberately: the demo's own closing chapter calls the two family lines *rivers* — water can be scenery, meaning, or both.

**Architecture, furniture, vegetation, and field-scale placement.** Raising the physical richness of the world within flat-matte and the budgets.

**Procedural vs. pre-made libraries.** The framing that keeps this from being either/or: the three-layer model already gives it shape — *forms* stay procedural; *pre-made libraries become assets that profiles reference*; and the settled prop-house principle (curate offline, then select and arrange) extends from objects to vegetation and set pieces. The working hypothesis to test: macro landform procedural; rivers procedural paths with a stylized water treatment; **vegetation as a pre-made species library procedurally scattered by era and region profile**; furniture and objects pre-made and arranged (already settled); landmarks and hero set pieces pre-made. Decision inputs per category: aesthetic ceiling (pre-made usually wins), variety at scale (selection-and-arrangement of pre-made pieces *is* procedural variety), memory and draw-call cost, and — the genuinely scarce resource — Greg's authoring time at two design days a week. Engineering supplies the cost/quality data; Greg makes the aesthetic call.

## 7. Under exploration — interesting, not yet committed

**Token-generated portraits** of family members: period-style *painted impressions*, never claimed likenesses, always carrying honesty tags. Cached per individual — the spec's own distinction applies: rooms key on the cell, but portraits are biography-like and individual-keyed, which is exactly what Witness's existing `enrichment_cache` already does.

**Token-generated conversations** with ancestors: dialogue bounded by the record under full Scrivener discipline — facts mined, voice period-and-personal, nothing invented — and where the record is silent, the ancestor honestly cannot answer. That silence is not a failure state; it is a research quest pointing back at the Research tab.

**A customizable home base**: a persistent interior that displays rewards, keepsakes, and portraits at a glance. Note the double duty: for a 55+ audience, a fixed, familiar anchor is also the strongest wayfinding device in the toolkit.

All three are design-in-progress. Nothing generated reaches a build without honesty tags, gates, and Greg's sign-off.

## 8. Closed questions — do not reopen

Inside-vs-separate (closed: inside Witness). Real-time 3D vs AI-generated stills for the *world* (closed: real-time). Realistic figure representation (closed: dead). A general interior-furniture placement solver (closed: authored room plans + OBB collision audit — field-scale scatter is open design space, not a reopening). Texture/PBR realism (closed: flat-matte). Caching generated geometry (closed: never — §9). Letting the model invent objects or facts (closed: never). And per Greg's explicit call: **the Lantern scene-game as a product format (closed** — it is a component source; the walkable field with embedded chapters is the product).

## 9. Data and performance facts worth having in your head

- Howe/Field: 5,495 individuals, 1,852 families, 1,829 placeable households. The canonical demo embeds the entire layout and runs self-contained.
- Pipeline stages on our file: parse/resolve/score/layout **1.6 s → 402 KB**; grading and lines of descent **4.0 s**; full geometry **4.2 s → 297 MB**. **Cache stages 1–2 at upload. Never cache stage 3** — regenerate client-side, in batches. Room cache keys are the *cell* (region, period, class, trade, household composition), never the individual — deliberately unlike Witness's `enrichment_cache`, which is right for biographies (and for portraits, §7) and wrong for rooms.
- Real-data pathologies, now permanent fixtures: 43 chronological impossibilities, 22 individuals recorded only as `?`, second NAME records used as disambiguators, 341 doorways to households with no interior, the 297 MB ceiling that forced batched building.
- World stability: store the year→radius curve and freeze existing plots when new people arrive. A street that moves is a hallucination with good lighting.
- Everything so far is headless; nothing has been verified on glass. Useful Witness datapoint: the 8,600-person production tree now loads in ~4 s — bigger than our test file.

## 10. Where this hands off — in order

1. **Industrialize the demo lineage.** Monorepo per `FSV_REBUILD_SPEC.md`; the canonical demo preserved untouched as reference; its systems migrated into packages; a world-level gate suite standing before anything changes — including the first accessibility gates (type sizes, tap targets, contrast, a persistent wayfinding affordance).
2. **Harvest the components into the world**: the Scrivener and writing gate into the chapters (The Long Field is the bar); the discovery engine and director toward *found* chapters (collect V2 evidence, don't conclude it).
3. **World fabric.** The architecture module folded into the field, plus the terrain, water, vegetation, and library-asset seams built ready for Greg's design decisions — with the per-category cost/quality data that lets the procedural-vs-library calls get made on evidence.
4. **Device truth for the actual audience.** Everything on a real iPad, verified against 55+ readability, comfort, and wayfinding — not just framerate.
5. **Witness integration spike.** WebView embed, the data bridge, entry from Family Stage into the field.
6. **Formal privacy layer**, extending the demo's living-band withholding into stated, tested policy.
7. **Exploratory spike, behind flags:** portraits, conversations, home base — per §7's constraints.

Greg is designing landforms, water, vegetation, and the library question in parallel this week; the handoff above is deliberately shaped so the two tracks meet instead of colliding.

## 11. In this package

The developer prompt (`FSV_DEVELOPER_PROMPT_2026-08-04.md`), this brief, the immersion catalogue (`FSV_IMMERSION_CATALOGUE_2026-08-04.md` — the feel-layer element library, used one entry at a time via its own session preamble), `FSV_REBUILD_SPEC.md`, **`08_02_2026_demo.html`**, `the-long-field.html`, `howe_field.html`, the project files zip (pipeline modules, template, harnesses, four built family games, coverage build), `discoveries.json`, and the GEDCOM fixtures (Howe_Field, atani, synthetic, pathological where present).

Walk the demo first. Everything else is explanation.

---

## 12. Package arrival and verification — 2026-08-05 (Rufus)

*Appended after §11 by Rufus on 2026-08-05. Records what has actually landed against §11's manifest, what inspecting it verified, and what it changes. Greg's rev. 3 text above stands unaltered.*

### 12.1 Arrival ledger

**Received 2026-08-05** — `FSV_REBUILD_SPEC.md`, `the-long-field.html`, `howe_field.html`, `discoveries.json`, `atani.ged`. All are now in `docs/Street_view_demos/`. With the canonical demo already present, **Milestone 1 is unblocked** — the rebuild spec was its stated dependency.

**Still outstanding.** The project files zip — `gedcom_discovery.py`, `scrivener.py`, the narrative director, `build_game.py`, `lantern_template.html`, `architecture_module.js`, the test harnesses, the four built family games, the coverage build — plus the `synthetic` and `pathological` GEDCOM fixtures. This is now the *only* missing item, and it is the whole executable component library described in §4. Everything received is data and reference builds; none of it is the code that produced them.

### 12.2 What the arrivals verify

**`howe_field.html` validates the SceneSpec contract.** Its embedded `RAW` array is 1,829 records — one per placeable household, matching §9 exactly — and its fields map one-for-one onto `HouseholdSpec` in `packages/streetview/src/spec/types.ts`: `fid→id`, `y→year`, `c→era`, `b→band`, `s→score`, `k→children`, `sr→sources`, `sn→surname`, `hn/wn→husbandName/wifeName`, `hl/wl→lifespans`, `md→marriageDate`, `pl→place`, `p1/p2→fatherFamilyId/motherFamilyId`. Distributions confirm the design: era cells `colonial_hall` 453, `federal_farm` 375, `england_hall` 276, `milltown` 244, `postwar` 112, and 295 with no period the evidence can support (typed `null`); bands `partial` 748, `documented` 700, `lost` 280, `living` 101. Two reconciliations remain: `RAW.s` is banded 40–90 where `HouseholdSpec.score` is 0..1, and `RAW` carries both `k` and `nk` where the spec carries only `children`.

**`the-long-field.html` supplies the missing chapter contract.** §3 names it "the bar for chapter interiors and prose" but no scene *schema* had been written down. Its `SPEC.scenes[]` is one: `id`, `cell`, `year`, `era`, `place`, `title`, `quest[3]`, `persona`, `fact`, `card_atmos`, `reveal`, `npc[4]`, `objects[][5]`, and a `pal{sky,fog,ground,wall,floor,roof,key,amb}` palette. Its `cell` vocabulary is the same as `howe_field`'s — the two demos already share the era taxonomy. This should be formalised as `ChapterSpec` v1 beside `SceneSpec` v1.

**`discoveries.json` is the found-chapters engine's output, and it works.** 5,495 people / 1,852 families / **0 warnings**; 4,579 scored candidates across six detectors (`history` 4,090, `convergence` 397, `texture` 40, `anomaly` 39, `immigrant` 10, `deep_line` 3); years 168–2009; 4,308 candidates carry a resolved place. Scores run 6.6–287.3, mean 23.3. Three assembled spines (7, 5 and 7 scenes) score 496.8 / 473.2 / 463.6. The ranking is sound: every top-scoring candidate is a `convergence`, which is precisely the structure §14's *Where the Rivers Meet* was hand-picked for. This is §4's claim demonstrated on disk.

### 12.3 Four findings that change the work

1. **The V1 spine already exists in the repo.** `packages/streetview` (types → rng → generate → engine, ~1,050 lines) plus `apps/streetview-lab` is already GEDCOM → SceneSpec → walkable field: merged per-material geometry, banded door markers, ghost platforms for `lost`, descent roads, tap-to-walk. FSV V1 is not a from-scratch build. The demos are ahead on richness; the repo is ahead on structure, and the two now have a verified common contract.

2. **The three.js version conflict resolves in the repo's favour.** Both demos load r128 from cdnjs; `apps/streetview-lab` pins `three@^0.178.0` and `engine.ts` already runs on it. **r178 is the mandate**; the demos stay read-only reference and are read for intent, never ported line-for-line.

3. **The selection layer and the authoring layer do not yet meet.** `discoveries.json` candidates carry `title`, `detail`, `mood`, `year`, `place`, `people`, `records` — enough to *rank and locate* a chapter. They carry no NPC dialogue, no objects, no reveal prose, no palette. `the-long-field`'s six scenes have all of that, hand-written. The bridge between them is the Scrivener, which is in the still-missing zip. **V1 must therefore not depend on generated prose** — see `FSV_V1_PLAN.md`.

4. **Two data defects to fix before any of this prose reaches a player.**
   - *Married-surname collapse.* Convergence loglines render the wife under her married name, so the highest-scoring output in the file reads "Two lines cross: Henry F Scott m. Rose A Scott", "Irving C Howe m. Carrie E Howe", "Shirley Scott Howe m. Shirley Howe". The detector is right; the name renderer is using the wrong NAME record. As written, the single strongest beat in the corpus is unusable.
   - *Tonal skew.* Candidate moods are 62% negative — grief 1,220, dread 968, hardship 674 — against warmth 13, wonder 40, awe 3. For the 55+ audience of §2 an unmoderated director will assemble a relentlessly grim walk. The spine assembler needs an explicit tonal budget, not just a score sort.

   A third item to check rather than fix: 4,579 candidates yield only **3** spines. Confirm whether that is a hard cap in the director or the natural yield of the scoring, because §2's "thousand unique experiences" depends on the answer.

### 12.4 Housekeeping

`atani.ged` is currently in `docs/Street_view_demos/`; per `FSV_REBUILD_SPEC.md` §5 it belongs in `packages/core/fixtures/` beside `Howe_Field Family Tree.ged`. `discoveries.json` (2.0 MB) and `howe_field.html` (567 KB) are large enough that they should be read by tooling, never pasted into a session.

Two of `FSV_REBUILD_SPEC.md`'s open questions are already closed by this brief and should be read as historical: §6's inside-vs-separate fork (closed — inside Witness, §8) and its figures-or-implied-presence question (closed — authored named figures inside chapters only, §5).
