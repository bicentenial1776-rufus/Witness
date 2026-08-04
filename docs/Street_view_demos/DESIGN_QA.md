# Street View — Design Q&A (August 2026)

*Companion to TECH_RECOMMENDATIONS.md. Approach A (browser-hosted Three.js engine) is decided; these are the five follow-on design questions: world arrangement, ancestor voices, navigation controls, dexterous actions, and entry points.*

---

## 1. World arrangement — organic vs. ancestral branch vs. fan chart

**The governing fact: ground-level-only (per the Aug 2 decision, no fly-over) means the user never perceives the global shape.** So the arrangement is a *wayfinding* decision, not a visual one. That reframes all three options:

**Literal fan chart** — user at the apex, generations radiating in ahnentafel sectors. It's the genealogist's mental model, and placement is fully deterministic. But walked at ground level the fan is invisible, and the geometry breaks on contact with real data: ten generations is 1,024 ancestor slots (exponential crowding at the rim — the opposite of the demo's even density), pedigree collapse makes the chart non-planar (the same couple legitimately occupies two sectors), and there is no honest place for siblings, second marriages, or collateral lines — which is exactly the texture that makes households feel real.

**Pure organic** — settlement realism, houses clustered by era and place. Most immersive and most believable, but it strands the user: nothing about the terrain tells you where your Acadian line lives or how to find great-grandmother's house.

**Recommendation: organic on the surface, branch-structured underneath — which is what the 08.02 demo already implements and what I'd carry forward.** Distance from the hub encodes time (generations), compass bearing encodes surname line, marriage links relax neighboring lines toward each other, and roads are literal lines of descent. It *reads* as a landscape but *navigates* as a pedigree.

Two supporting moves:

- **The primary navigation is topological, not spatial.** The brief's back-door mechanic (each house's back door opens onto the two parents' households) means users mostly traverse the family *graph*; the outdoor world is connective tissue, atmosphere, and the hub. This takes most of the pressure off the global arrangement.
- **Give the fan chart its right job: the map.** A 2D fan/pedigree overlay in the notebook ("you are here, in the Beliveau line, 4 generations back") is a superb orientation device. The fan is a great map and a poor terrain — use it as one.

---

## 2. Ancestor voices — male / female / children

Three tiers, in ascending cost and risk:

**(a) Text + score only** — what all three demos do. The Conductor already does the emotional work of "voice" (a wedding sounds like a wedding). Cheapest, safest, and fully aligned with the mandatory disclaimer that dialogue is simulated.

**(b) Procedural "murmur" voices** — Animal Crossing–style pitched syllable tones, differentiated by sex and age (lower/slower for men, higher for women, lighter for children), generated in Web Audio with zero assets. Gives every figure an audible presence and personality while *keeping the fiction honest* — nobody mistakes a murmur for a recording of the dead. On-brand with the zero-asset discipline, essentially free.

**(c) Cached neural TTS** — real synthesized voices (OpenAI TTS or similar), pre-generated per narrative line and cached in `enrichment_cache` + Storage. Cost is fine (~$0.02–0.05 per scene, generated once per cached narrative). Two real cautions: a realistic human voice makes AI-invented words *feel like fact*, which raises the ethical stakes the disclaimer decision was meant to manage; and **skip child voices entirely** — synthetic children's voices sit deep in the uncanny valley and carry sensitivity we don't need.

**Recommendation: launch with (a) + (b).** Add (c) later as an *accessibility/read-aloud option* — genuinely valuable for the 55+ audience and the multiple-reading-levels requirement — framed as **narration** ("a voice reading the words") rather than the ancestor speaking, with adult male/female narrator voices only.

---

## 3. Navigation controls — simplest for the older, non-gaming crowd

Ranked from most to least "gamer-shaped":

| Scheme | Verdict |
|---|---|
| Two-thumb joystick + look-drag (current demos) | Explicitly rejected by the Aug 2 meeting — correctly. Simultaneous two-hand input is where non-gamers fail. |
| Single joystick, auto-facing camera | Better, but a joystick is still an abstraction to learn. |
| **Tap-to-walk (point-and-go)** | **Recommended default.** Tap a doorway, a person, a glowing marker — the avatar walks there and the camera turns to face it. One finger, zero vocabulary to learn, same gesture on iPad and with a mouse on desktop. |
| Node/hotspot teleport (Myst / Google Street View arrows) | Simplest possible, but it turns the world into a slideshow and undermines the quest/exploration layer. Keep as a fallback idea, not the plan. |
| Guided auto-walk ("take me there") | Not a scheme by itself, but the perfect complement — see below. |

**The recommended package:**

- **Tap-to-walk everywhere.** The road network the generator already builds doubles as the navmesh; indoors, the room floor is the navmesh.
- **A persistent "Guide me" affordance** that auto-walks the user to the current objective pin (the waypoint system in the 08.02 demo, upgraded from pointing to *escorting*). This is the single highest-value control for this demographic — nobody can get lost, ever.
- **The camera manages itself.** Auto-face on arrival, gentle auto-frame during walks; drag-to-look available but never required. Camera control — not movement — is what actually defeats non-gamers.
- **One context-sensitive Act button** (the Lantern demo pattern): the *only* other input in the whole experience.
- Comfort defaults: no fail states, no time pressure, generous interact radii (3–6 m as in the demos), head-bob **off** by default (already flagged in the Elements-of-Design notes), joystick available as an opt-in "explorer mode" toggle for the minority who want it.

---

## 4. Picking things up and other dexterous actions

**Recommendation: no physics, no free manipulation, ever.** Everything routes through the single context Act button:

- **Acquisition:** walk near → button reads "Take the christening cloth" → tap → it's in the satchel, recorded in the notebook. This is exactly the keepsake system the Lantern demo proves out, and it *is* the pickup experience — just with the failure modes removed.
- **Placement (the ofrenda / home-decorating reward layer):** predefined placement slots — approach a mantel or shrine, tap the slot, choose the artifact from a sheet, it appears. Drag-to-arrange with snapping can come later as polish, but must never be required.
- **One ambient held item** — the lantern precedent. A held object that needs zero management gives hand-presence, a light source, and a narrative anchor for free.

Rationale: hand tremor and touch precision are real in the 55+ demographic; physics interactions are the largest QA surface in any 3D product; and slot-based interactions keep all state trivially serializable to Supabase — which the reward layer needs anyway for persistence across sessions and (eventually) Inheritance Transfer.

---

## 5. Entry points — where the experience should launch from

**Architectural rule first: every entry point compiles to the same scene-spec tuple — (anchor person/family, date, place) — feeding one generator.** Entry points are then cheap doors, not separate builds. The Disney hub model follows naturally: the entry defines the hub (you materialize at the anchor household), and the back-door graph plus outdoor connective tissue take it from there.

**Launch with two doors:**

1. **Family Stage household → "Step inside this household."** Conceptually perfect: the Stage is already the app's family-unit surface, and the Street View house *is* a family unit per the brief. The set-switcher (multiple marriages) even maps to variant scenes.
2. **The Portrait → "Visit [name] at home, 1741."** The Portrait is the universal destination every tap and search already routes to — this single door gives Street View maximum reach, and **direct-search entry comes free** (search → Portrait → visit), so no separate search integration is needed.

**Fast follow (cheap once the household scene exists):**

3. **Weekly digest / This Week deep-links** — "Married this week in 1701 — step into the wedding." The digest already performs editorial selection of anniversary ancestors; linking each entry to a dated household scene is a pure retention play with near-zero marginal build cost.

**Later (a second scene *type*, not just a new door):**

4. **Map / place-era scenes — "Sudbury in the 1700s."** Genuinely compelling — and it's really the 08.02 demo scoped to one place and era (all households with events in Sudbury, 1690–1760). But a multi-household settlement is a different generation problem (bigger spec, bigger cost, outdoor-first) than the household interior that is the product's core. Build it second, on the proven engine.
5. **Temporal-event scenes** ("walk 1676") last — they carry the heaviest content-safety burden (war, epidemic) against the universal-audience requirement, and they need the most editorial guardrails.

---

*Net: arrange the world organically with branch logic underneath and a fan-chart map in the notebook; give figures murmur-voices now and narrated read-aloud later (no child voices); navigate by tap-to-walk with a "Guide me" escort and a self-managing camera; make every object interaction a single Act tap into slots and satchel; and open the experience from Family Stage and the Portrait first, with digest deep-links, place-era scenes, and event scenes staged behind them.*
