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

## Listed in the rev. 3 package but NOT yet received (as of 2026-08-05)

- `FSV_REBUILD_SPEC.md` (July 28) — repo layout, test strategy, caching design; Milestone 1 depends on it
- `the-long-field.html` — the quality bar for chapter interiors and prose
- `howe_field.html` — the settlement-generator ancestor
- Project files zip: `gedcom_discovery.py`, `scrivener.py`, the narrative director, `build_game.py`, `lantern_template.html`, `architecture_module.js`, test harnesses, the four built family games (`lantern-howe/-rose/-war/-brennan.html`, `lantern-districts.html`), coverage build
- `discoveries.json`
- GEDCOM fixtures beyond Howe/Field: `atani.ged`, synthetic, pathological

The developer prompt's §0 says to stop and ask rather than guess at missing load-bearing files — the rebuild spec and the component-library zip are load-bearing. Ask Greg for the rest of the package before starting Milestone 1.
