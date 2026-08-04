# Street View Lab

Standalone dev harness for the Family Street View engine (see
`docs/Street_view_demos/TECH_RECOMMENDATIONS.md` and `STREET_VIEW_DESIGN.md`).
**Never ships. Everything it exercises does** — the spec generator and engine
live in `packages/streetview` and are the production modules.

## Run

```bash
npm run dev -w @witness/streetview-lab     # http://localhost:5175
```

Drop any `.ged` / `.gdz` onto the page. Parsing happens entirely in the
browser with `@witness/core` — nothing uploads. Pick an anchor (defaults to
the person with the deepest ancestor line), and the generated world mounts.

- **drag** = look · **tap/click** = walk there, or select a house · WASD optional
- **Download spec** saves the generated scene-spec JSON — a deterministic
  snapshot you can re-drop later (no GEDCOM needed) and diff across engine
  changes. Snapshots contain family data: keep them in `data/` (gitignored).
- **seed** re-rolls the layout without changing the data.

## iPad testing

```bash
npm run dev -w @witness/streetview-lab -- --host   # then open http://<mac>.local:5175 on the iPad
```

or `npm run build -w @witness/streetview-lab` and deploy `dist/` to a Vercel
preview for remote testers.

## Privacy rules

- `data/` and any `.ged`/`.gdz`/spec snapshots in this folder are gitignored —
  real family data is never committed.
- The generator withholds names, dates, and places for living persons at the
  spec level, so nothing downstream (engine, snapshots) ever sees them.
  The smoke test asserts this: `npm run smoke -w @witness/streetview`.
