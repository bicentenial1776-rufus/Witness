# Family Street View — Design Document

*August 2026. Consolidates the adopted design directions for the Option A build (browser-hosted Three.js engine — see TECH_RECOMMENDATIONS.md), folding in the world-arrangement, voices, navigation, interaction, and entry-point decisions plus figure fidelity and period-accuracy management. Supersedes DESIGN_QA.md. The Aug 2, 2026 meeting decisions recorded in PROJECT_BRIEF.md remain the constitutional layer: ground-level only, hub navigation, iPad + desktop only, strictly generative, mandatory disclaimer, universal audience.*

---

## 1. World arrangement — organic, with branch logic underneath

**Decision: organic on the surface, pedigree-structured underneath** (the 08.02 demo's layout, carried forward).

The governing fact is the ground-level-only rule: the user never perceives the global shape, so arrangement is a *wayfinding* decision, not a visual one.

- **Distance from the hub encodes time** (generations), **compass bearing encodes surname line**, marriage links relax neighboring lines toward each other, and **roads are literal lines of descent**. The world *reads* as a landscape but *navigates* as a pedigree.
- A literal fan chart was considered and rejected as terrain: invisible at ground level, exponentially crowded at the rim (10 generations = 1,024 slots), non-planar under pedigree collapse, and with no honest place for siblings, second marriages, or collateral lines.
- Pure organic (settlement realism with no underlying logic) was rejected for stranding users.

**Supporting moves:**
- **Primary navigation is topological, not spatial.** The back-door mechanic (each house's back door opens onto the two parents' households) means users mostly traverse the family *graph*; the outdoor world is connective tissue, atmosphere, and the hub.
- **The fan chart gets its right job: the map.** A 2D fan/pedigree overlay in the notebook ("you are here — the Beliveau line, 4 generations back") is the orientation device. The fan is a great map and a poor terrain.

---

## 2. The figures — fidelity, faces, and voices

### Fidelity target: "museum diorama," not photorealism

**Decision: stylized-but-proportioned figures — a step up from the demos' block figures, deliberately short of realism.**

The register to aim for is the museum diorama or carved artisan figure: correct human proportions, real posture, weight, and gait; richly detailed **period costume** (the costume carries the realism — waistcoats, kerchiefs, aprons, hats by era and station, as the demo's costume system already sketches); and **deliberately simplified faces** — suggested features, never modeled likenesses.

Why stop short of realism:
- **Honesty.** We do not know what a 1690 ancestor looked like. A photoreal face is fabrication presented as fact — the same ethical line the voice and disclaimer decisions already drew. Stylization *is* the disclaimer, rendered visually.
- **The uncanny valley** is steepest exactly where we'd be standing: near-real depictions of specific dead people.
- **Performance and pipeline.** Stylized figures stay within the zero-asset, procedural discipline that makes the whole world shippable.

**Implementation path (in order of preference):**
1. **Enhanced procedural generator** — upgrade the demo's figure builder: capsule limbs instead of boxes, corrected proportions, a simple bone rig for walk/idle/gesture cycles, layered costume geometry driven by the era style pack (§3). Stays 100% code-generated.
2. If (1) hits a ceiling: a **tiny library of stylized base bodies** (male/female/child, low-poly, rigged — a few glTF files totaling well under 1 MB), dressed and colored procedurally per era. A pragmatic bend of the zero-asset rule, not a break: the bodies are generic; everything identifying remains generated.
3. Photoreal avatar pipelines (Ready Player Me et al.) — rejected.

**Data-driven variation:** height scaled by age at the scene date (per the brief's time-slider rule), build and coloring seeded per person (stable across visits), costume by era, region, and station from the style pack. Distant NPCs use the low-detail tier the demo already implements.

**Faces and photos:** where the GEDCOM has photos, they appear on the detail card and may appear in-world as a **portrait-medallion treatment** (a framed miniature, a cameo) — never texture-mapped onto a 3D head.

### Voices

**Decision: launch with text + score + procedural murmurs; add narrated TTS later as accessibility; no child voices ever.**

- **(a) Text + the Conductor** (as in the demos) — the adaptive score already does the emotional work of voice; a wedding *sounds* like a wedding.
- **(b) Procedural "murmur" voices** — Animal Crossing–style pitched syllable tones differentiated by sex and age (lower/slower men, higher women, lighter children), generated in Web Audio, zero assets. Audible presence and personality while keeping the fiction honest — nobody mistakes a murmur for a recording of the dead. Ships at launch with (a).
- **(c) Cached neural TTS** — later, as a **read-aloud accessibility option** (genuinely valuable for the 55+ audience and the multiple-reading-levels requirement). Framed as *narration* — a voice reading the words — not the ancestor speaking. Adult male/female narrator voices only; pre-generated per cached narrative line (~$0.02–0.05/scene, once) and stored alongside `enrichment_cache`. **Synthetic child voices are excluded permanently** — uncanny and needlessly sensitive.

The caution that governs (c): a realistic human voice makes AI-invented words *feel like fact*, which is precisely what the mandatory disclaimer exists to prevent. Narrator framing keeps the line clean.

---

## 3. Period accuracy — homes and artifacts by era

**Decision: era×region style packs — versioned, data-driven, authored at build time; runtime AI narrates, it never invents the material culture.**

The 08.02 demo already prototypes the correct architecture: era cells (`england_hall`, `colonial_hall`, `federal_farm`, `quebec_farm`, `milltown`, `postwar`), each pairing a parameterized house/room generator with a furniture-and-artifact manifest, every object tagged with a provenance tier. Formalize that into the production system:

### The style pack

A versioned JSON/TS module per era×region containing:
- **Architecture parameters** — form, roof type, materials, window/door schedule, chimney logic (the demo's `HOUSE` profiles).
- **Interior manifest** — furniture and artifact list with a placement grammar (against-wall, around-table, on-surface — the demo's layout system), scaled by household data (children present → that many stools, per the record).
- **Artifact catalog entries** — each with a short historical note and a **provenance tier**: *From the record* (derived from the GEDCOM: dates, children, marriage, sources) / *Inferred* (justified from place + period) / *Period typical* (representative furnishing). The demo's hover cards already render this; keep it — **the tier system is the honesty layer**, the visual equivalent of source citations, and the reason the experience can be period-*evocative* without claiming false period-*authority*.
- **Year ranges on artifacts within the pack** — so the time slider works inside an era: the rushlight yields to the oil lamp yields to the bulb without changing packs (the demos' lamp-kinds-by-era show the pattern).

### Selection: (place, year, evidence) → pack

A resolution ladder, exactly as the demo assigns cells:
1. Exact region + era pack (Quebec farm, 1740s)
2. → broader region, same era
3. → generic era pack
4. → the **"records lost" ghost state** (already designed) when evidence can't support an interior at all.

Never fail — always degrade to the nearest honest representation, labeled as such.

### Authoring and sourcing

- **Packs are researched once, at build time, human-reviewed** — with Claude as a research assistant against the free sources the brief already prioritizes (NARA, DPLA, Library of Congress, museum period-room literature). **Probate inventories are the gold mine**: they literally enumerate household goods by era, region, and station — the primary source a furniture manifest wants.
- **Runtime AI never generates material culture.** It narrates within the pack. This division is what keeps the ~$3/user/year runtime budget honest and content quality controlled — the same principle as "the model never generates geometry" in TECH_RECOMMENDATIONS.md, extended up one level.

### Coverage strategy

- Launch with the packs the actual user base's trees need — the demo's six cells (Colonial New England, federal farm, Québec/Acadian, England pre-crossing, mill town, postwar) already cover the test tree end to end.
- **Demand-driven expansion:** when imported trees resolve to an era×region with no pack, log it — that's the build queue, ranked by real user need. Until a pack exists, the ladder degrades gracefully with *Period typical* labeling.
- **Version pinning:** the scene spec records the pack version it was generated against, so cached narratives, bookmarks, and notebook entries stay consistent when packs improve.

---

## 4. Navigation — one finger, never lost

**Decision: tap-to-walk default, "Guide me" escort, self-managing camera, one Act button.**

| Scheme | Verdict |
|---|---|
| Two-thumb joystick + look-drag (the demos) | Rejected (Aug 2 meeting) — simultaneous two-hand input is where non-gamers fail |
| Single joystick, auto-facing camera | Better, but still a learned abstraction |
| **Tap-to-walk (point-and-go)** | **Default.** Tap a doorway, person, or marker — the avatar walks there, the camera turns to face it. One finger, zero vocabulary, identical gesture on iPad touch and desktop mouse |
| Node/hotspot teleport (Myst-style) | Simplest, but turns the world into a slideshow and undermines the quest layer — fallback idea only |

The package:
- **Tap-to-walk everywhere.** The generated road network doubles as the outdoor navmesh; room floors serve indoors.
- **A persistent "Guide me" affordance** auto-walks the user to the current objective pin (the demo's waypoint system upgraded from *pointing* to *escorting*). The single highest-value control for this demographic — nobody can get lost, ever.
- **The camera manages itself** — auto-face on arrival, gentle framing during walks; drag-to-look available, never required. Camera control, not movement, is what actually defeats non-gamers.
- **One context-sensitive Act button** (the Lantern demo pattern) is the only other input in the experience.
- Comfort defaults: no fail states, no time pressure, generous interact radii (3–6 m), head-bob off by default, joystick as an opt-in "explorer mode" toggle.

---

## 5. Interaction — pickup, placement, and the held item

**Decision: no physics, no free manipulation. Everything routes through the Act button.**

- **Acquisition:** proximity + Act ("Take the christening cloth") → satchel → notebook entry. The Lantern demo's keepsake system, verbatim in spirit.
- **Placement** (the ofrenda / home-decorating reward layer): predefined **placement slots** — approach a mantel or shrine, tap the slot, choose the artifact from a sheet. Drag-to-arrange with snapping may come later as polish; it is never required.
- **One ambient held item** — the lantern precedent: hand-presence, a light source, and a narrative anchor, with zero management.

Rationale: hand tremor and touch precision are real in the 55+ demographic; physics is the largest QA surface in any 3D product; and slot-based interaction keeps all state trivially serializable to Supabase — which persistence across sessions (and eventually Inheritance Transfer) needs anyway.

---

## 6. Entry points — many doors, one generator

**Architectural rule: every entry compiles to the same scene-spec tuple — (anchor person/family, date, place) — feeding one generator.** Entry points are cheap doors, not separate builds. The hub model follows: the entry defines the hub (you materialize at the anchor household); the back-door graph and outdoor connective tissue take it from there.

**Launch (two doors):**
1. **Family Stage household → "Step inside this household."** The Stage is already the app's family-unit surface; the Street View house *is* a family unit. The set-switcher (multiple marriages) maps to variant scenes.
2. **The Portrait → "Visit [name] at home, 1741."** The Portrait is the universal destination every tap and search already routes to — maximum reach from one door, and **direct-search entry comes free** (search → Portrait → visit).

**Fast follow:**

3. **Weekly digest deep-links** — "Married this week in 1701 — step into the wedding." The digest already curates anniversary ancestors; linking entries to dated household scenes is near-zero marginal cost and a strong retention hook.

**Later (second scene *type*, not just a new door):**

4. **Place-era scenes** — "Sudbury in the 1700s": all households with events in a place and era, outdoors-first. Effectively the 08.02 demo scoped to one place — compelling, but a larger generation problem than the household interior at the product's core. Build second, on the proven engine.
5. **Temporal-event scenes** ("walk 1676") last — heaviest content-safety burden (war, epidemic) against the universal-audience rule; needs the most editorial guardrails.

---

## Companion documents

- **TECH_RECOMMENDATIONS.md** — platform decision (Option A: browser-hosted Three.js engine, WebView on iPad, direct mount on web), scene-spec contract, performance budget.
- **PROJECT_BRIEF.md §Family Street View** — the Aug 2, 2026 constitutional decisions this document builds on.
- The three demos in this folder — the working reference implementations for world generation (`08.02.2026 demo.html`), adaptive score (`conductor-demo.html`), and narrative staging / keepsakes / touch UI (`innkeepers-lantern-v2.html`).
