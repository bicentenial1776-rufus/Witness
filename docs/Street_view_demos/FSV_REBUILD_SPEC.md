# Family Street View — rebuild specification

*Written at the end of the prototype phase, to carry the learning across.*
*Greg Howe & Rufus Howe.*

---

## 1. What this is

A GEDCOM file becomes a walkable place. Each household is a building; each
building has an interior furnished from what the record actually says; and the
gaps in the record are expressed as architecture rather than as error messages.

Seven prototypes were built to find out what the thing is. It has been proven
against three real corpora:

| corpus | size | what it proved |
|---|---|---|
| synthetic 3-culture | 500 people, 129 households | the cultural cell model |
| **Howe / Field** (real Ancestry export) | 5,495 people, 1,829 households | scale, real-data pathology |
| **atani** (Middle-earth) | 284 people, 190 households | the model is not Anglo-specific |

The prototypes are single-file HTML. **They are reference implementations, not
a codebase.** Everything below is what should survive.

---

## 2. The architecture that works

### 2.1 Three layers, and only the third is cultural

This is the central idea and it held up across New England, Guangdong,
Basilicata, Banat, Québec and Númenor.

- **Forms** — parametric geometry with no culture in it. ~30 of them. A comal,
  a bakestone, an iron skillet and a delft charger are one form. A bench is a
  table at 450mm. A stove is a stove whether it is a Cantonese *zao*, a Banat
  *sobă* or a Cleveland gas range.
- **Materials** — a flat registry. Cheap, and carries enormous cultural signal.
- **Profiles** — the only culturally specific layer, **and it is data**. Rows
  naming: slot → form → material → params → placement → provenance tier → label.

Adding a culture is writing a profile. It must never mean touching a renderer.

### 2.2 Slots, not objects

Universal functional positions: heat source, cooking vessel, work surface,
seating, seating-of-precedence, storage, display, sleeping surface, light
source, devotional focus, textile, apertures. The culture fills them.

If the renderer ever hardcodes "fireplace", the app is permanently
northern-European.

The payoff is legible: in the postwar room the television stands in the heat
slot and the ancestral tablets arrive in the devotional slot **as framed
photographs**. That reading is only possible because the slots are abstract.

### 2.3 Composition, not solving

A general placement solver was built, and it produced garbage — windows on the
wrong walls, chairs inside tables, ±23° of random rotation. It was replaced by
**authored plans with a validator**, and that is the right answer:

- Every piece names the wall it stands against or the piece it serves.
- Rotation is always **derived**, never random. Jitter is ±1°.
- Seating is placed on the **offset rectangle** of the table, using the seat's
  **circumradius** — a chair turned to face a table corner projects further
  than its half-depth. This specific error is what put chairs inside tables.
- An **audit** runs on every plan × every child count × every confidence band:
  rotated-AABB bounds, OBB overlap on every pair, door-swing clearance, and
  sightline clearance for the ancestor doorways.

Current state: 25–60 layouts per corpus, **0 failing**. The audit found 19 real
collisions the eye missed.

### 2.4 A wall is a solid with holes in it

Not an object parked in front of one. `wallPanel(length, height, thickness,
openings)` emits the solid pieces *around* the voids — piers, the block under a
sill, the block over a head. The reveal is then the wall's own faces at the
correct depth, for free.

This one function fixed: displaced windows, floating frames, and the
"disjointed" reading. Corollaries that also mattered:

- **Gables are solid triangular prisms**, not stacked boxes. Roofs are closed
  solids (extruded hexagonal section for a gable; four faces for a true hip),
  so nothing can gap at ridge or verge.
- **Corners must close.** Front and back walls run the full width; the side
  walls overlap inward. Extending the *outward-facing* panels instead produces
  a visible protrusion.

### 2.5 Landscape strictures

Buildings do not sit on slopes.

- Every building has a **finished floor elevation**, snapped to 250mm.
- The **platform is cut to the whole complex** — not to the main block. In the
  Middle-earth build, every complex overhung its pad by 7–21m because the
  gatehouses, stables and barrows were outside it. That is what made them read
  as built on nothing.
- The edge is decided **per metre by the actual drop**: earth batter under ~2m,
  coursed retaining wall above it, an arcade of arches above ~5m. Final ratio
  on Middle-earth: 61% built, 39% earth, 1,417 arches.
- **Roads are corridors, not decals.** Sample the graded ground, smooth the
  longitudinal profile, clamp the gradient (16% for wheeled traffic), then grade
  the terrain *around* the corridor so road and land are one surface.
- **Roads yield to platforms.** Inside a pad the floor level is final.
- Paths must **skirt every plot they pass**, not only the two they connect.
  Deflect tangentially — same radius, new bearing — so the route still reads as
  running outward.

### 2.6 Confidence is the render budget

Evidence score → band → what gets built:

| band | treatment |
|---|---|
| documented | full detail, enterable |
| partial | reduced detail, enterable, thinner furnishing |
| lost | ghost footprint, no interior |
| living | sealed, **no names, no places** |

This is simultaneously the honesty layer and the performance layer. It is not a
compromise; it is the design.

### 2.7 Absence as architecture

Where the record stops, the doorway is **filled with masonry**. Not a dialogue
box. Every user eventually hits one, and it is the emotional centre of the
whole thing.

Variants earned by real data:

- **no parent recorded** → sealed, plain
- **the file contradicts itself** (a cycle) → sealed, and says so
- **chronologically impossible** (parent dated after child) → *opens*, but the
  lintel bar turns red and the label states the discrepancy. The link may be
  sound and the date wrong; don't cut it, flag it.

### 2.8 Wayfinding: the doorway is the navigation

A pedigree is a graph rendered as a landscape. Landscapes are superb for scale
and hopeless for traversal — standing in a room in 1720, the father's house is
one of 1,829 and cannot be found.

The solution that works:

1. Two ancestor doorways cut through the wall, flanking the heat source.
2. Behind each, a shallow recess finished in the **destination room's**
   materials and lit by whatever lit that room. You can see the century through
   the door — firelight for 1650, kerosene for 1880, television-blue for 1960.
3. Taking one **never cuts**. The camera rises through the roof and flies the
   actual line of descent, then descends into the far hall. ~3.5s.
4. Every trip is drawn on the world and stays there.
5. A ladder lists the generations; the whole line is clickable.

---

## 3. What the real data did that synthetic data never would

Findings from the Howe/Field and atani corpora that should become **test
fixtures**, because every one of them broke something:

- **43 chronological impossibilities** — a father-household dated 43 years
  after his son's.
- **Cycles** — a household as its own ancestor. Howe/Field had none; the
  detector must still exist, because most large trees do.
- **20+ individuals named literally `?`**, with the descriptor in a second
  `NAME` record. Rendered naively this reads as a bug on 40% of doors.
- **Second `NAME` is usually a disambiguator, not an epithet** —
  `Eärendur (son of Tar-Amandil)`. Shown as an epithet it repeats the name.
- **341 of ~1,300 doorways lead to a household with no interior.** Not an edge
  case. Flying there and landing *outside* the house is the correct behaviour.
- **Place strings lie.** `Middlesex, England` where 394 other Middlesexes in
  the same file are Massachusetts. One word moved the founder of the American
  line across an ocean. **The resolver must report its guesses, not make them
  silently.**
- **297MB of vertex data** for 1,829 buildings. Merging in one pass exhausted
  memory. Batch it.
- **Rank-based positions are not stable under insertion.** Adding a branch of
  500 people moves the whole world. Store the **year→radius curve**, not the
  ranks, and freeze existing plots when new ones arrive. This is required by the
  persistence principle: a street that moves is a hallucination with good
  lighting.

---

## 4. Pipeline and caching

Measured on Howe/Field (1,829 households):

| stage | time | output |
|---|---|---|
| 1 — parse, resolve places, score evidence, lay out plots | 1.6s | **402 KB** |
| 2 — grade platforms, trace lines of descent | 4.0s | a few hundred KB |
| 3 — generate all building geometry | 4.2s | **297 MB** |

**Cache stages 1 and 2 at upload. Never cache stage 3.** Stage 3 is the
counter-intuitive one: it is the stage that needed batching, but it is the worst
cache candidate — you would ship 300MB to save four seconds of building boxes.
Regenerate it on the client, in batches.

**Cache key is the cell, not the individual.** Witness's `enrichment_cache` is
keyed `(individual_id, enrichment_type)` — correct for biographies, wrong for
rooms. Rooms key on (region, period, class, trade, household composition).
Genealogy clusters hard, so marginal cost approaches zero. Keep the shared
layer (the room) separate from the personal layer (the people, which is pure
data and needs no AI).

**Do not let the model invent objects.** Curate a sourced library offline; the
model selects and arranges. Set decorator with a prop house, not a novelist.

---

## 5. Proposed repository

```
fsv/
  packages/
    gedcom/          parse → normalised model. No rendering. Pure functions.
      fixtures/      howe-field.ged, atani.ged, synthetic.ged, pathological.ged
    model/           households, evidence scoring, bands, cells, cycle + chronology detection
    profiles/        the cultural data layer. JSON or TS objects. No code.
    forms/           parametric geometry. No culture.
    layout/          composition + the audit. Pure geometry, fully unit-testable.
    site/            FFE, platforms, batter/masonry decision, corridors, grading
    render/          three.js. The only package that imports three.
    app/             camera rigs, transit, UI
  apps/
    web/             Vite build
  docs/
```

### Test strategy — the part that failed hardest

Everything that broke was in a **pure** layer, and every one was findable
without a GPU:

- `layout` — the audit is already a test suite. Run it over every profile ×
  every child count × every band. Assert zero.
- `site` — assert every platform is level to 20mm; assert no complex corner
  hangs off; assert no corridor exceeds its gradient; assert no path crosses a
  foreign platform.
- `model` — run the fixtures and assert the known counts (43 chronology errors,
  0 cycles, 22 unnamed heads). These become regression tests.
- `app` — **drive the real loop.** Every serious bug that reached Greg survived
  because a test called an inner function directly. A fake clock and a fake
  renderer are fine; a fake *control flow* is not.
- Do not hand-roll a three.js stub. Either test the pure layers (where the bugs
  were) or use real three.js headless.

**And: patches must assert.** Every silent no-op in this project came from a
string replacement that matched nothing and reported success.

---

## 6. The decision that comes first

From the original memo, still unanswered and now blocking:

> **Does FSV live inside Witness, or is it a separate experience Witness
> launches into?**

Inside Witness means React Native / Expo, and the renderer is constrained.
Separate means a game engine becomes possible. Every downstream choice —
engine, asset pipeline, whether stage 3 runs on device — follows from this.

Second: **figures or implied presence.** Every prototype has deliberately shown
empty rooms mid-use — kettle on the fire, bowls on the table, coat on the peg,
nobody there. It is powerful and it may not be the right long-term answer.

---

## 7. What to throw away

- The single-file concatenation
- Every hand-rolled three.js stub
- The general placement solver
- Any texture generation (flat colour plus good light beat it decisively)
- My GEDCOM parser — it is minimal, and real files are far worse than it assumes
