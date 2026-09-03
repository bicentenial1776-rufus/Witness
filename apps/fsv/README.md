# apps/fsv — Family Street View

The world's home in the monorepo, per `docs/FSV_WITNESS_BRIDGE.md`.

    npm run world:sync -w @witness/fsv   # fetch the built world
    npm run dev       -w @witness/fsv    # sync, then serve
    npm run build     -w @witness/fsv    # dist/

## What is here

A Vite shell. Three.js lives in this directory and nowhere else in the
monorepo, as the brief requires.

## What is NOT here, and why

**The world artifact is not committed.** `public/world/witness_fsv_demo.html`
is a single self-contained offline HTML file produced by
`witness-demo/build/build.ps1` in the design repo (`GregSHowe/fsv`). It is
about 3 MB and it is rebuilt on every change, so committing it would add 3 MB
to this repo's history each time FSV ships a world — for a build that belongs
to another repo. `world:sync` copies it instead:

    npm run world:sync -w @witness/fsv                 # finds ../../fsv or $FSV_DESIGN_REPO
    npm run world:sync -w @witness/fsv -- C:/path/to/fsv

It fails loudly with the build command if it cannot find one, rather than
serving a stale world.

**Anything that reads the tree** is not here either. That is the bridge —
`packages/core/src/fsv/` — which is pure, tested, and importable by the
mobile app. Rendering never crosses that line.

## Ground rules

Deterministic generation: no `Date.now()`, no `Math.random()` in any path
that makes the world. Same file + same seed → same world, on every device.

When FSV's sources graduate from the design repo module by module they land
in `src/`, and this shell becomes their entry rather than a launcher.
