# Family Street View — Technology Recommendations

> **Note, 2026-08-05:** The platform recommendation here (Approach A — browser-hosted Three.js engine, WebView on iPad) was adopted and is confirmed by `FSV_PROJECT_BRIEF_2026-08-04.md` (rev. 3), which is now authoritative: the inside-vs-separate question is closed (inside Witness), three.js stays at r128, and `FSV_REBUILD_SPEC.md` governs repo structure. Where details here disagree with the rev. 3 brief (e.g. "strictly generative, no assets" — curated pre-made libraries are now in scope; "universal audience" — now 55+ iPad first-class), the rev. 3 brief wins.

*August 2026. Scope: iPad and web only (iPhone explicitly deferred, per Aug 2 meeting). Sources: PROJECT_BRIEF.md §Family Street View, docs/tech-stack.md, and the working demos in this folder (`08.02.2026 demo.html`, `conductor-demo.html`, `innkeepers-lantern-v2.html`) plus the Elements-of-Design and visual-magnets notes.*

---

## What the demos already prove

The three prototypes are single-file HTML running **Three.js (r128) + Web Audio**, with zero external assets — every material is flat color, every building/tree/person is procedural geometry, and the entire 1,829-household world merges into a few dozen draw calls. Concretely proven:

- A full GEDCOM-derived settlement (5,495 people → 1,829 placed households) renders and walks at interactive framerates in a browser, including terrain, roads-as-descent-lines, grass shader, day/night sky, NPCs, animals, and staged narrative scenes.
- Touch controls (left-thumb joystick + right-thumb look + tap-to-act) already exist in both game demos — the iPad input problem is solved in principle.
- The adaptive soundtrack ("The Conductor") is a **Web Audio API** composition engine — functional harmony, leitmotif, cadences — with no audio files at all.
- The "strictly generative, no hardcoded assets" mandate is satisfiable: the demos ship no textures, no models, no CDN assets beyond the Three.js library itself.

Two facts fall out of this that should drive the platform choice:

1. **The prototype investment is browser-shaped.** Thousands of lines of working, tuned Three.js and Web Audio code exist. Any approach that can't run this code roughly as-is throws that away.
2. **The Conductor only exists in a browser.** Web Audio has no native equivalent in the Expo/React Native world; recreating live-composed orchestration natively would be a project in itself.

---

## Constraints from the brief

- The shipped app is **Expo / React Native, universal** (iPad native app + web app at app.witnesslives.com). Street View must live inside or beside that, not replace it.
- Audience is **non-gamers, median age ~55** — simple controls, "good enough and doesn't break," no install friction.
- **Strictly generative**: scene content comes from the user's subtree + a period design-system library + Claude-generated narrative, not hand-authored assets. Cost target ~$3/user/year of Anthropic API.
- **One-person maintainability** ("Built to last… simplicity in architecture is a feature").
- Data lives in Supabase; the brief calls for subtree isolation and home-person routing.

---

## Approach A — Browser-hosted Three.js engine (WebView on iPad, direct mount on web) — **recommended**

Package the demo lineage into a proper module — call it `@witness/streetview` — a self-contained Three.js + Web Audio "engine" that accepts a **scene spec** (JSON: the isolated subtree, precomputed placements, narrative beats, disclaimers) and renders the experience. Host it two ways:

- **Web app:** mount it directly as a route in the existing Broadsheet web app (it's already React-DOM; the engine takes over a full-viewport canvas).
- **iPad app:** render it in a `react-native-webview` (or Expo DOM component) pointed at a bundled local build, with a `postMessage` bridge for: scene spec in; events out (bookmark saved, quest completed, "open this ancestor's Portrait" deep-links).

**Plus**
- **Reuses everything.** The three demos are 90% of the way to this architecture already; porting is refactoring, not rewriting.
- **One engine, two hosts, identical behavior** — iPad Safari/WKWebView and desktop browsers run the same WebGL2 + Web Audio code. Parity comes free.
- **The Conductor works unmodified.** Web Audio is native to this environment.
- Fast iteration: the engine can be developed and tested in a plain browser tab with hot reload, no Xcode/prebuild cycle, and even shared as a URL for the planned ~20-user non-gamer test *before* any app integration exists.
- WKWebView gets JIT-compiled JavaScript and full WebGL2 on iPadOS — performance is genuinely good, and the demos' merged-geometry/instancing discipline keeps draw calls low.
- Clean isolation: a crash in the 3D world can't take down the app; the WebView is disposable.

**Minus**
- A **bridge boundary** on iPad: tree data, bookmarks, and quest state cross via serialized messages rather than direct function calls. (Mitigated by the scene-spec design — one big payload in, small events out.)
- **WKWebView memory ceilings** (~1–1.5 GB before iPadOS kills the content process). The demo's merged-geometry approach fits comfortably, but it's a budget to respect — cap world size per generated scene, dispose aggressively on exit.
- Audio autoplay policies require a user gesture to start the AudioContext (the demos already handle this — "Take the Lantern" / first tap).
- Feels less "native" — no direct use of RN navigation, theming tokens must be duplicated into the engine's UI layer (the demos already carry their own HUD styling, so in practice this is a non-issue).

**Effort estimate:** the shortest path by a wide margin. The bulk of the work becomes the *real* work — the scene-spec generator (Supabase subtree → JSON), the period design-system library, and the Claude narrative pipeline — not platform plumbing.

---

## Approach B — react-three-fiber universal (expo-gl on iPad, react-dom on web)

Rebuild the engine as React components using **react-three-fiber (R3F) + drei**, rendered natively on iPad through `expo-gl` (Three.js over OpenGL ES) and via ordinary WebGL on web. One React codebase, no WebView.

**Plus**
- **True integration with the existing app**: the scene is React state; Supabase hooks, session, theming, expo-router deep links, and the Portrait screen are all directly reachable — no bridge, no message serialization.
- Native touch handling (RN Gesture Handler) instead of WebView touch events.
- The 3D world can interleave with native UI (sheets, share cards, notifications) seamlessly.
- Long-term, this is the more "product-shaped" architecture if Street View becomes a primary surface rather than a mode.

**Minus**
- **Substantial rewrite.** The demos are imperative Three.js; R3F is declarative. Every system — terrain, merged-geometry baking, the grass shader, staged scenes — must be re-expressed, and R3F's reconciler overhead punishes naive porting of a 1,800-object world.
- **expo-gl is the weak link**: it's a GLES bridge with known gaps and quirks versus real browser WebGL (shadow map edge cases, extension availability, texture formats, occasional regressions across Expo SDK upgrades). The demos' heavy use of shadows, fog, custom shaders, and `onBeforeCompile` would each need re-validation on-device.
- **The Conductor doesn't come along.** No Web Audio natively — the adaptive score would need a rebuild on `expo-audio`/AVAudioEngine (a significant sub-project) or a hidden WebView just for audio (at which point Approach A's "minus" has been re-imported).
- Ties the frame loop to the RN runtime — jank sources multiply (JS thread contention with the rest of the app).
- Slower iteration loop (native builds) and more surface area exposed to Expo SDK churn.

**When to choose it:** if, after user testing, Street View graduates from "an experience you enter" to "the primary way the app is navigated," the deep-integration payoff could justify the rewrite. Not before.

---

## Approach C — dedicated game engine (Unity or Godot) — considered, not recommended

Build the world in a real game engine; embed on iPad (Unity as a Library / Godot embed) and export WebGL/WASM for the web app.

**Plus**
- Best-in-class tooling: lighting, terrain, LOD, navmesh, audio middleware, profiling — the entire Elements-of-Design list (water, weather, footsteps, pooled lighting, distant terrain, haze) has off-the-shelf answers.
- Highest performance ceiling and headroom for future ambition (weather systems, crowds).

**Minus**
- **A second codebase in a second language** (C#/GDScript) with a second build pipeline — the single heaviest violation of "simplicity in architecture is a feature" for a solo-maintained product.
- Embedding in an Expo app is genuinely painful (Unity as a Library + RN is a known integration tarpit; every Expo prebuild becomes riskier).
- **Web export is the killer:** Unity/Godot WASM builds are 30–80 MB+ downloads, slow to boot, and historically fragile on Safari — exactly the wrong trade for a 55+ audience clicking a link in the web app.
- "Strictly generative from a JSON spec + Claude" is possible but swims against the engine's asset-pipeline grain.
- Licensing/runtime-fee exposure (Unity) for a $19.99/year product.

---

## Cross-cutting recommendations (apply regardless of approach)

1. **Formalize the scene spec.** The `08.02 demo` already does this implicitly (`RAW` array: family id, year, era-cell, evidence band, children, sources, parent links). Make it an explicit, versioned JSON contract produced server-side: *Supabase subtree → placement/era/evidence spec → engine*. Claude's job is narrative JSON (beats, dialogue, quests, keepsakes) attached to that spec — **the model never generates geometry**, keeping the ~$3/user/year budget realistic and the world deterministic (seeded RNG, as the demo does).
2. **Upgrade Three.js.** The demos pin r128 (2021). Move the engine to a current release (r16x+, WebGL2 default): better instancing, `BatchedMesh` for the merged-building trick, color management, and years of Safari fixes. Do this at the start of the port, not after.
3. **Keep the zero-asset discipline.** Flat-shaded procedural everything is not just a cost decision — it's the reason the whole world fits in memory, ships instantly, works offline-ish, and sidesteps a content pipeline. Treat the period "design-system library" as *parameterized generators* (the demo's `HOUSE`/`P` profiles) rather than model files.
4. **Cache generated narrative** in the existing `enrichment_cache` pattern, keyed by (family_id, scene_type, variant), so repeat visits are free and the bookmarking/notebook feature has stable content to reference.
5. **Performance budget for iPad:** target 30 fps sustained on an A12-class iPad, ≤ 300 draw calls, ≤ 700 MB. The demo techniques (chunked geometry merging, instanced trees, capped point lights, one shadow-casting sun) already fit; write the budget down and test against the oldest supported iPad early.
6. **Ship the mandatory disclaimer and reading-level modes in the engine's own UI layer** so they exist identically on both hosts from day one.

---

## Bottom line

| | A: Three.js in WebView/web | B: R3F + expo-gl | C: Unity/Godot |
|---|---|---|---|
| Reuses existing demos | ✅ near-fully | ⚠️ rewrite | ❌ none |
| Conductor (adaptive score) | ✅ as-is | ❌ rebuild | ⚠️ re-author in middleware |
| iPad ↔ web parity | ✅ identical code | ⚠️ two GL backends | ❌ weak web story |
| Integration with app data/UI | ⚠️ message bridge | ✅ direct | ❌ heavy embed |
| Solo maintainability | ✅ | ⚠️ | ❌ |
| Performance ceiling | Good | Good-with-caveats | Best |
| Time to testable build | **Weeks** | Months | Months+ |

**Recommendation:** Approach A. Package the demo lineage as `@witness/streetview` behind a versioned scene-spec contract, mount it directly on the web app and via WebView on iPad, and spend the saved months on the parts only this product can do: the subtree→spec pipeline, the period design-system generators, and the Claude narrative layer. The spec contract keeps Approach B open as a later migration if Street View earns a deeper seat in the app.
