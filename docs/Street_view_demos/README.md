# Family Street View — document index

Reading order per Greg's rev. 3 handoff (2026-08-04). **`FSV_PROJECT_BRIEF_2026-08-04.md` is authoritative over every other document in this folder**; the canonical experience reference is `08.02.2026 demo.html` (the brief calls it `08_02_2026_demo.html` — same file: title "Howe / Field — Family Street View", 4,591 lines). Reference builds are read-only, forever.

## Present in repo

| File | Role |
|---|---|
| `FSV_PROJECT_BRIEF_2026-08-04.md` | **Authoritative.** Current state, settled decisions, audience, this week's design front. |
| `FSV_DEVELOPER_PROMPT_2026-08-04.md` | The continuation prompt: ground rules + Milestones 1–8. Begin with its §0 inventory. |
| `FSV_IMMERSION_CATALOGUE_2026-08-04.md` | Feel-layer element library; used one to three entries per session via its own preamble. |
| `08.02.2026 demo.html` | **Canonical demo.** Read-only reference. |
| `conductor-demo.html`, `innkeepers-lantern-v2.html` | Earlier prototypes (Conductor audio engine; Lantern scene-game — component source, not product format). |
| `STREET_VIEW_DESIGN.md`, `TECH_RECOMMENDATIONS.md` | Aug 3 docs, partially superseded — see their header notes. |
| `08.02.2026 Elements of Design.jpg`, `visual_magnets (1).jpg` | Greg's design notes. |
| `../../packages/core/fixtures/Howe_Field Family Tree.ged` | The real GEDCOM fixture (5,495 individuals). |
| `FSV_V1_PLAN.md` | The V1 engineering plan — scope, sequence, and gates. Written 2026-08-05 against brief §12. |

### Arrived 2026-08-05

| File | Role |
|---|---|
| `FSV_REBUILD_SPEC.md` (July 28) | Repo layout, test strategy, caching design. **Milestone 1 is now unblocked.** Its §6 open questions are closed by the brief — read as history. |
| `howe_field.html` | The settlement-generator ancestor. Embeds `RAW`: 1,829 households, field-for-field compatible with `HouseholdSpec`. |
| `the-long-field.html` | The quality bar for chapter interiors and prose. Its `SPEC.scenes[]` is the de facto `ChapterSpec` schema. |
| `discoveries.json` | Discovery-engine output: 4,579 scored candidates, 3 assembled spines, 0 warnings. 2.0 MB — read with tooling, never paste. |
| `atani.ged` | Middle-earth fixture (284 people). **Belongs in `packages/core/fixtures/`** per rebuild spec §5. |

See brief §12 for what inspecting these verified, and for the two data defects (married-surname collapse in convergence loglines; 62% negative mood skew) that must be fixed before the prose reaches a player.

## Listed in the rev. 3 package but NOT yet received (as of 2026-08-05)

- Project files zip: `gedcom_discovery.py`, `scrivener.py`, the narrative director, `build_game.py`, `lantern_template.html`, `architecture_module.js`, test harnesses, the four built family games (`lantern-howe/-rose/-war/-brennan.html`, `lantern-districts.html`), coverage build
- GEDCOM fixtures beyond Howe/Field and atani: synthetic, pathological

This is the whole executable component library of brief §4 — everything received so far is data and reference builds, not the code that produced them. The developer prompt's §0 says to stop and ask rather than guess at missing load-bearing files. **Ask Greg for the zip.** Milestone 1 no longer waits on it (see `FSV_V1_PLAN.md`), but Milestone 2 — harvesting the Scrivener and discovery engine — cannot start without it.
