# apps/fsv — Family Street View's home in the monorepo

Reserved 2026-08-27 for the FSV app/bench code as it graduates from the design
repo (`GregSHowe/fsv`). Empty on purpose until Greg's first scaffold PR.

**Read `docs/FSV_WITNESS_BRIDGE.md` before putting anything here** — it maps
the wiring Witness already provides (parser, TreeIndex, households, geocoded
places, evidence, living flags, enrichment pattern), defines the bridge seam
(`packages/core/src/fsv/`), and carries the branch/PR conventions
(`fsv/<topic>` branches, PR to main, never a direct push).

Ground rules for this directory: Vite + three.js live here and only here (the
mobile app never imports three.js); generation paths stay deterministic — no
`Date.now()`, no `Math.random()`; same file + same seed → same world.
