# FSV Immersion Catalogue
### The elements of a living world — curated for Family Street View · August 4, 2026

A catalogue of the immersive-design elements that do the most work in the best-regarded 3D games of the recent era, translated into FSV's constraints: **flat-matte, no textures; three.js r128; iPad in a WebView; a 55+ audience; the honesty system.** Small-team games (Firewatch, Sable, A Short Hike, Valheim) prove the central claim: **atmosphere beats fidelity**, and almost everything below is cheap.

This document is built to be *used*, not read once. Every element has a stable ID, an impact rating (★–★★★), a cost tier, a build sketch that respects the no-texture law, and a testable "done when."

---

## How to use this for iterative vibe coding

1. Pick **one to three entries** for a session — ideally a coupled pair (a visual and its sound).
2. Paste the **Session Preamble** below, then the chosen entries, into Claude Code.
3. The agent inventories the current state of that element first, implements, runs gates, shows output.
4. Comfort-adjacent elements ship with a settings toggle, defaults per the entry.
5. Never more than one *system-level* element (weather, wind, guide) per session.

## Session Preamble — copy this block first

```
You are doing an immersion pass on Family Street View (FSV) — a continuous walkable
world built from a real family GEDCOM. Canonical reference: 08_02_2026_demo.html;
target codebase: the fsv monorepo if present, otherwise a working copy of the demo
(never the reference file itself).

Laws of this world:
- Flat-matte aesthetic. NO texture maps, no PBR, no decals. Vertex colors, solid
  materials, gradients, fog, Points, and shaders only.
- three.js r128, iPad target inside a WebView. Budget: 60fps with dynamic resolution;
  no per-frame allocation; pool audio buffers; Points/instancing for anything repeated.
- Audience is 55+: any camera-motion effect defaults gentle-or-off and gets a settings
  toggle; text and tap targets stay large; nothing strobes.
- Audio is gesture-gated (existing law). New sounds join the existing master chain and
  duck under dialogue.
- The honesty system stands: facts are never invented, objects come from the curated
  library, the living band stays withheld, and the Sexton / keepsakes / Family Book /
  honesty tags are never stripped or altered by an immersion pass.
- Coupling rules (below) are mandatory: new elements subscribe to the existing world
  clock, wind clock, weather state, and biome/interior state — never a private timer.

Process: (1) locate and report the current state of the target element(s) in the code;
(2) implement the entry as specced, smallest viable version first; (3) run the gate
suite and the headless playthrough; (4) show gate output verbatim; (5) list the settings
toggles added. One element at a time. Stop and ask if an entry conflicts with code
reality.

Target entries for this session:
[PASTE ENTRY/ENTRIES HERE]
```

## Coupling rules — the meta-skill

The difference between a diorama and a place is that a place *agrees with itself*:

- **One world clock.** Sun, moon, bells, lamplighting, ambience beds, and schedules all read the same hour.
- **One wind clock.** A single gust signal (strength + direction, slow Perlin drift) drives grass sway, tree sway, smoke bend, drifting seeds, water shimmer bias, *and* the wind audio bed. A gust you hear is a gust you see.
- **Fog is the sky's child.** Fog color always equals the current horizon color; distance fades into atmosphere, never into gray.
- **Weather is a state machine, not a coin flip.** Fronts arrive visibly from a horizon direction over minutes and leave memory behind (wet ground, petrichor bed).
- **The threshold is sacred.** Crossing a doorway swaps the acoustic space, the light adaptation, and the ambience bed together, in one beat.
- **Surface is a queryable map.** Footsteps, particle response, and ground-cover visuals all read the same surface ID under the player.

---

# The Catalogue

## SKY — sky and weather

**SKY-1 · Aerial-perspective fog tie-in — ★★★ · low**
Why it works: Firewatch's whole look is distance dissolving into the sky's own color; depth reads as air, not draw distance.
FSV fit: the lost band already speaks in fog — make *all* distance speak the same language.
Build: fog color lerped every frame to the sky shader's horizon color for the current hour; slightly denser at dawn/dusk keys.
Done when: at any hour, the farthest houses melt into the horizon color with no gray band; zero new assets.

**SKY-2 · Weather states with visible fronts — ★★★ · med**
Why it works: RDR2's storms are *seen coming* — anticipation is half the weather.
FSV fit: a front rolling over the field of ancestors is free drama; overcast also flatters flat-matte.
Build: state machine (clear / high cloud / overcast / rain / clearing) with 3–8 min dwell; cloud-shader density and sun intensity lerp over 60–120 s; fronts enter from a fixed compass direction.
Done when: standing still for ten minutes shows one believable weather change, never a pop.

**SKY-3 · Rain — ★★ · med**
Why it works: rain re-scores everything beneath it (RDR2, Ghost of Tsushima).
FSV fit: texture-free rain is easy: it's lines, sound, and a darker palette.
Build: camera-attached Points volume (~800 streaks, velocity-stretched), palette darken, rain bed + eave-drip one-shots near buildings; couples to SKY-2 and leaves TER-6 puddles.
Done when: rain arrives with its front, sounds different under a roof overhang, and stops leaving wet memory.

**SKY-4 · Dawn mist banks — ★★★ · low**
Why it works: low morning fog is the cheapest "painting" in games (Firewatch, Valheim dawns).
FSV fit: mist pooling in the hollows between eras makes the field breathe; it rhymes with the lost band without lying about evidence.
Build: 6–12 large translucent flat-color planes hugging low terrain, slow drift on the wind clock, opacity keyed to sun angle (burns off by mid-morning).
Done when: dawn holds mist in low ground that is gone an hour later; <1 ms; no textures.

**SKY-5 · The record-true moon — ★★ · low**
Why it works: nobody else can do this. Signature FSV.
FSV fit: the honesty system extended to the sky — compute the *actual lunar phase* for a chapter's date (Christmas 1701, 29 May 1943) and show it during that chapter's night.
Build: standard astronomical phase calculation from the chapter date; phase drives the existing moon disc's lit fraction; tag it in the Family Book: "From the record: the moon that night."
Done when: each dated chapter night shows its historical moon, and the journal says so.

**SKY-6 · Rare night delights — ★ · low**
Shooting stars (1–2 per night, single bright Point with fading trail) and, in the far northern-latitude eras only, a faint aurora band. Delight budget: rare enough to be remarked on.
Done when: a full night watch yields one gasp, not a light show.

**SKY-7 · Crepuscular shafts after rain — ★★ · low**
Why it works: Elden Ring taught everyone that a shaft of gold means *go toward*.
Build: 3–5 additive gradient-quad cones from cloud gaps during the "clearing" state; no true volumetrics.
Done when: the end of rain is a small event; shafts never appear mid-storm.

## LGT — light and color

**LGT-1 · Magic-hour grading — ★★★ · low**
Why it works: golden hour and blue hour are when every screenshot happens (Tsushima's entire palette discipline).
Build: two extra key windows in the existing day cycle (warm low-sun grade; cool pre-dark grade), 20–30 min each of world time; schedule chapter arrivals to exploit them.
Done when: sunset in the field is worth stopping for, twice a day, reliably.

**LGT-2 · Dusk lamplighting across the field — ★★★ · low-med**
Why it works: distant warm windows are the oldest signal of life in art.
FSV fit: signature move — as dark falls, **documented** households light their windows one by one over ~10 minutes; partial houses dimmer; lost houses never. The record keeps its lamps lit. Doubles as band-legibility and night wayfinding.
Build: emissive lerp on window glass materials, staggered per house by hash; couples to world clock.
Done when: nightfall is a slow constellation of the documented, and a lost house reads dark at a glance.

**LGT-3 · Flame behavior — ★★ · low**
Hearths, candles, the held lantern: intensity + position jitter (two summed sines + noise), warm color, and a subtle response when the player walks close (air disturbance — flames notice you).
Done when: no flame in the world is static; passing a candle bends it for half a second.

**LGT-4 · Interior shafts and dust motes — ★★★ · low**
Why it works: Edith Finch's rooms feel inhabited by light itself.
Build: one gradient quad shaft per lit window at the sun's angle + 60–150 slow Points inside it; motes only in still interiors.
Done when: entering a documented interior by day, light is a visible object.

**LGT-5 · Threshold eye adaptation — ★★ · low**
Why it works: RDR2/TLOU sell interiors with a half-second of blindness.
Build: exposure lerp (~0.7 s) on doorway crossing, both directions; couples with AUD-3's acoustic swap in the same beat.
Done when: stepping into a dim hall from noon sun takes one breath to resolve.

**LGT-6 · The held lantern, ported — ★★ · low**
Night travel with a shadowless warm point light in hand: flicker per LGT-3, subtle sway on the walk cycle (not the camera), auto-raised at dusk, lowered at dawn.
Done when: night walking feels accompanied, and the lantern never bobs the horizon.

## AIR — particles and air

**AIR-1 · Chimney smoke — ★★★ · low-med**
Build: Points ribbons rising from **documented, occupied-era** chimneys, bent by the wind clock, denser at morning and evening (meal hours — the world keeps time).
Done when: smoke direction always matches grass gusts; lost houses never smoke.

**AIR-2 · Meadow drift — ★★ · low**
Seeds/pollen Points drifting on the wind by day in grass cells; moths replacing them around lanterns by night; embers only within a few meters of open flame.
Done when: still air is never empty near life, and particle type follows time of day.

**AIR-3 · Winter breath and hush — ★ · low**
In winter-tone chapters: small breath puffs from the player and figures outdoors, snow-muffled ambience (low-passed bed), and AUD-1's snow footsteps.
Done when: the 1943 kitchen's cold outside is audible and visible before the door opens.

## TER — terrain, horizon, and water

**TER-1 · Distant ridgeline silhouettes — ★★★ · LOW (do this first)**
Why it works: the single cheapest transformation in 3D — Firewatch, Sable, and A Short Hike frame every view with 2–3 stepped, desaturated ridge layers.
FSV fit: Greg's own ask; the field currently ends, and it should instead *rest against* a world.
Build: 2–3 concentric ring meshes of low-frequency ridge profiles beyond the field, each flat-colored one step closer to the horizon color (they are the aerial-perspective gradient made solid); slight parallax from camera height; static, no textures.
Done when: every screenshot has a composed background; cost <0.5 ms; the horizon never shows the fog band raw.

**TER-2 · A world beyond the field — ★★ · low**
One or two far, unreachable silhouettes past the ridges — a spire, a headland — hinting where the lost lines ran. Atmosphere and honest metaphor in one mesh.
Done when: players ask "what's out there," and the answer is the Research tab.

**TER-3 · The river presence bundle — ★★★ · med**
Why it works: water is the loudest quiet thing in RDR2 and BotW — heard before seen, sparkling at the right sun angles.
FSV fit: this week's design front. Rivers are terrain-following graded features (site rules apply); treatment is texture-free.
Build: (a) flow shimmer — a scrolling vertex-color luminance wave along the river mesh; (b) sun-glint sprite field aligned to sun azimuth, evenings especially; (c) bank darkening band; (d) AUD-8's distance-mixed river bed; (e) fords with splash footsteps and a knee-deep slow.
Done when: a river announces itself at 60 m by sound, at 200 m by glint, and crossing one is an event.

**TER-4 · Water life ripples — ★★ · low**
Expanding ring geometry (fading line loops) from player steps in shallows, raindrops during SKY-3, and an occasional fish rise with a soft *ploop*.
Done when: still water is never dead; rings never z-fight.

**TER-5 · Readable ground cover — ★★ · low**
Path, grass, threshold-stone, and ford read as distinct flat colors underfoot, matching the surface map that drives AUD-1 — the eye and the ear agree, and 55+ players see the road.
Done when: the surface under your feet is nameable at a glance and sounds like what it is.

**TER-6 · Puddles and wet memory — ★ · low**
Dark ellipse quads with a single sky-color glint after rain, fading over ~10 minutes with a petrichor ambience layer.
Done when: rain is remembered, briefly, then gone.

## LIFE — flora and fauna

**LIFE-1 · Wind through grass and crops — ★★★ · med**
Why it works: BotW's fields are alive because gust *waves* travel visibly across them.
Build: shader sway (per-blade phase + height) driven by the wind clock, with traveling gust fronts (a moving band of increased amplitude); crops sway stiffer than meadow.
Done when: you can watch a gust cross the field and hear it arrive (AUD-4) as it reaches you.

**LIFE-2 · Tree response — ★★ · low-med**
Vertex sway scaled by height, canopy shimmer via slight per-vertex luminance oscillation in wind; creak one-shots in strong gusts near old trees.
Done when: no tree is a statue; big gusts are audible in the wood.

**LIFE-3 · Birds that live here — ★★★ · low-med**
Why it works: the RDR2/BotW startle — birds that flush when approached — is the highest immersion-per-triangle event in games.
Build: (a) existing wheeling flocks retained; (b) perched-bird points on fences/roofs that flush with wing-flutter audio inside a 6 m radius, arcing away; (c) dawn chorus density tied to the ambience bed.
Done when: walking a fence line scatters life, and it never happens the same way twice.

**LIFE-4 · Period yard animals — ★★ · med**
The no-crowds rule covers *people*; animals are ambient life. Culture/era-appropriate and library-driven: oxen and sheep at farms, chickens in dooryards, a cat at a documented hearth, gulls only near coastal place-names. Simple flat-matte forms, idle loops, small wander radii, one sound each.
Done when: each district's animal set matches its era profile, and the cat is where the warmth is.

**LIFE-5 · Small fliers — ★ · low**
Butterflies/dragonflies near water and meadow by day (2–3 Points with wander curves), moths at lanterns by night (shared with AIR-2).
Done when: near water at noon, something small is always moving.

## AUD — audio (half of immersion, a tenth of the budget)

**AUD-1 · Surface-keyed footsteps — ★★★ · low (the foundation)**
Why it works: RDR2's ground talks; the feet are the body's most constant sensor.
Build: surface map query per step → packed earth, grass, gravel, wood interior, stone threshold, ford water, snow; 4 variants each, ±5% pitch and ±2 dB jitter, synced to the gait cycle; wood interiors slightly louder with room tone (AUD-3); optional near-silent satchel foley layer.
Done when: eyes closed, you can name the ground; no two consecutive steps are identical samples.

**AUD-2 · Ambience beds by biome and hour — ★★★ · low-med**
Why it works: Skyrim and RDR2 are 70% ambience bed; it is the world's continuity.
Build: crossfaded loops — dawn chorus, day meadow, dusk crickets, night owls-and-wind — layered with proximity beds (river by distance, trees-in-wind near woods, hearth-crackle indoors); all under the existing master chain and dialogue duck.
Done when: time of day is identifiable by ear alone, from any recording of 20 seconds.

**AUD-3 · The threshold acoustic — ★★★ · low**
Why it works: TLOU's rooms are rooms because outside gets far away.
Build: on doorway crossing (with LGT-5, same beat): low-pass + attenuate the exterior bed, add small-room tone and a touch of early reflection to closerange SFX; reverse on exit.
Done when: a doorway is audible with your eyes closed.

**AUD-4 · Wind you can hear arriving — ★★★ · med**
Build: the wind clock's gust signal drives a wind bed's gain/filter with ~300 ms lead over the visible gust front reaching the player (LIFE-1), plus leaf-hiss when near trees.
Done when: see the grass wave coming, hear it land on you.

**AUD-5 · Bells from the landmarks — ★★★ · low (signature)**
Why it works: Animal Crossing keeps its whole audience oriented in time with hourly music; FSV has real steeples.
Build: district landmark bell towers ring the world-clock hour — count matches the hour, distance-delayed and softly panned by direction; different districts' bells have different pitches.
Done when: players know the hour and the direction of town without UI; bells never overlap dialogue.

**AUD-6 · Distant one-shots by context — ★★ · low**
A far dog bark near postwar streets, axe-on-wood near farms, the mill wheel's rumble in milltown, cartwheels on gravel — 1 per 60–120 s, quiet, panned, never nearby.
Done when: the middle distance is inhabited; nothing distant is ever seen failing to exist.

**AUD-7 · Doors, latches, thunder — ★★ · low**
Doors creak open and latch closed (heavier = lower pitch); thunder follows lightning with distance-true delay during SKY-2 storms.
Done when: no door teleports silently, and storm distance is countable.

**AUD-8 · Water proximity mix — ★★ · low**
The river bed swells smoothly with 1/distance², intensifies at fords and under crossings; part of TER-3.
Done when: you could walk to water blindfolded.

**AUD-9 · The Sexton's air — ★★ · low**
His far-off voice carries gentle distance reverb; beds duck −6 dB under him (dialogue duck exists — extend it); his lines never fight a bell.
Done when: the narrator sounds like weather, not a speaker.

## CAM — camera and body

**CAM-1 · Headbob, done right for this audience — ★★ · low**
Greg's spec: light, and it can be turned off. For 55+: **default OFF**, settings offer Off / Subtle / Standard; amplitude scales with speed; fully suppressed during dialogue and letterbox; never rotational, vertical translation only (≤ 8 mm world-scale at Subtle).
Done when: the toggle exists, defaults off, and Subtle is invisible to anyone not looking for it.

**CAM-2 · Step-settle micro-motion — ★ · low**
A 2–3 mm camera settle on footfall (shares CAM-1's toggle) and a soft ease over thresholds and stair steps — no vertical pops, ever.
Done when: stairs feel walked, not teleported, with the toggle off by default.

**CAM-3 · Gentle-hands control tuning — ★★★ · low (comfort-critical)**
Look smoothing, generous dead-zones, three sensitivity presets with **Gentle as default**, adjustable joystick size/position, and an evaluated tap-to-walk-to mode as a full alternative to the stick.
Done when: a first-time 60-year-old tester never overshoots a doorway.

**CAM-4 · Soft look-hinting — ★ · med (test before trusting)**
≤ 2°/s camera magnetism toward the active chapter's door-light when the player stands idle nearby; any input cancels instantly; its own toggle, default ON only if audience testing proves comfortable.
Done when: it helps the lost and is unfelt by the found — or it ships disabled.

**CAM-5 · Sitting — ★★★ · low (signature fit)**
Why it works: Ghost of Tsushima's hot springs and RDR2's chairs prove that *stopping* is content.
FSV fit: benches, hearthside chairs, a churchyard wall. Tap to sit: camera lowers and steadies, controls reduce to look, ambience swells slightly, UI fades, time keeps passing; tap to stand. Perfect pacing for this audience — and sitting by an ancestor's hearth is the whole point of the product.
Done when: a player can sit through a dusk lamplighting (LGT-2) and want to.

## OBJ — interaction and object feel

**OBJ-1 · Approach highlight — ★★★ · low (accessibility + immersion together)**
Interactables within reach get a soft warm rim-pulse (slow, 0.5 Hz, colorblind-safe, generous radius) — never an icon floating in the world.
Done when: nothing interactive is missable at arm's length, and screenshots stay diegetic.

**OBJ-2 · Take-to-hand keepsakes — ★★ · low**
Pickup lerps the object to the camera for a beat before it joins the satchel with its chime; standardize across all seven keepsakes.
Done when: taking the christening cloth feels like taking it.

**OBJ-3 · Examine mode — ★★ · low-med**
Long-press a keepsake in the Family Book: full-screen slow rotate against a vignette, its record card and honesty tags beside it, large type.
Done when: every keepsake can be turned in the hand and read at arm's length.

**OBJ-4 · Doors that open — ★★ · low**
Swing + AUD-7 sound, brief threshold pause syncing LGT-5 and AUD-3; no walk-through-solid, no teleport.
Done when: every enterable door behaves like a door.

## WAY — wayfinding as atmosphere (the 55+ requirement, made beautiful)

**WAY-1 · The diegetic guide — ★★★ · med (design decision: build candidates behind flags)**
Why it works: Ghost of Tsushima removed the compass and let wind lead; Elden Ring's grace-light points the way in gold.
FSV candidates for Greg to test: (a) **birds** that lift near the player and fly a short arc toward the next chapter when idle; (b) the next household's **hearth-light and smoke** reading distinctly on the horizon; (c) the Sexton's **far lantern** glinting along the route at night; (d) road wear subtly strengthening toward the destination.
Done when: one candidate, flag-enabled, lets a first-timer find chapter two unaided with the HUD marker off.

**WAY-2 · Landmark legibility pass — ★★★ · low**
The district weenies exist; verify each is silhouette-distinct and visible from its district's entries at TER-1's ridgelines' scale; bells (AUD-5) give them voices.
Done when: from anywhere, one landmark is identifiable, and it tells you where you are.

**WAY-3 · The drawn map — ★★ · med**
A hand-inked period-style map page in the Family Book (flat colors, labeled districts, chapter seals), you-are-here as an inked mark; large type, high contrast.
Done when: orientation is available in one tap and looks like it belongs to 1870.

**WAY-4 · Postcard mode — ★★ · low-med**
Frame the view, period border, chapter caption from the record, save/share. For this demographic, sharing *is* engagement — and every postcard is Witness marketing.
Done when: grandmother sends the Wayside Inn at golden hour to the family thread.

---

## Deliberately out of bounds — do not let a session drift here

Texture maps, normal/PBR detail, decals and grime passes; screen-space reflections/AO and post-processing chains; photoreal water; realistic ambient human crowds; ragdolls and physics showpieces; per-object realtime shadows at scale; anything that strobes; any effect requiring a texture asset. If an entry seems to need one of these, the entry is being misread — every build sketch above is achievable with vertex colors, solid materials, gradients, Points, shaders, fog, and sound.

## Session menus

**Quick wins (first two sessions):** TER-1 ridgelines → AUD-1 footsteps + TER-5 ground cover → AUD-3 + LGT-5 thresholds → AUD-2 ambience beds.
**Signature FSV (the ones no other game can do):** LGT-2 dusk lamplighting · AUD-5 bells · SKY-5 record-true moon · CAM-5 sitting · WAY-1 guide candidates.
**Big rocks (one per session, alone):** SKY-2 weather · LIFE-1 + AUD-4 wind coupling · TER-3 river bundle · WAY-1 testing.
**Comfort pass (before any audience test):** CAM-1 · CAM-2 · CAM-3 · OBJ-1.

One rule above all: **add nothing that doesn't agree with the world clock, the wind, and the record.** That agreement — not the count of effects — is what the top of this era's games actually mastered.
