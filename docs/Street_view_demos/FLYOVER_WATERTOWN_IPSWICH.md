# Demo flyover: Watertown to Ipswich, circa 1810

*2026-09-09. A production recipe for a 40–60 second illustrated flyover in
the style of the three ChatGPT stills (Ipswich aerial with callouts, the
Howe house exterior, the Howe parlour). Companion to STREET_VIEW_DESIGN.md.*

## The shot

| Beat | Where | Camera |
|---|---|---|
| Start | Watertown Square, the Charles bend, mills and meeting house | High, looking north-east, ~600 m up |
| Glide | Cambridge farms, Medford and Malden woods, the Saugus marshes, Lynn and Salem harbours off the right wing, Wenham and Hamilton stone walls | Steady heading ~40° (NE), constant altitude |
| Arrival | Ipswich River, the wharf, Meeting House Green, Castle Hill beyond | Descend to ~250 m |
| Settle | The Howe neighbourhood, label fades in | Slow drift, hold 4 s |

Watertown Square to Ipswich Green is about 44 km on a bearing of 40°. At
45 s that is ~1 km/s of ground speed, which reads as a glide at these
altitudes; 60 s is more leisurely.

**Label:** "The Howe Family — Ipswich, Mass., circa 1810."

## Anchor the geography on real 1830 surveys, not a generic New England

Every Massachusetts town had to file a surveyed plan in 1830 (Resolves
1829, c. 50). Those plans, plus Hales's regional sheet, cover the whole
corridor, and the Leventhal Map Center has digitized them with no known
restrictions on use.

| Map | Covers | Georeferenced | Downloads |
|---|---|---|---|
| Hales, *Map of Boston and its vicinity*, 1829, 1:63,360 | Watertown through Beverly (Acton–Scituate, Beverly–Walpole) | Yes, Allmaps + **GeoTIFF 136 MB** | https://collections.leventhalmap.org/search/commonwealth:wd376528r |
| Hales, *Plan of Watertown*, June 1830 | Start beat, building by building | Check the page | https://collections.leventhalmap.org/search/commonwealth:25152g20x |
| Anderson, *Map of the town of Ipswich*, surveyed 1831, pub. 1832, 1:19,800 | Arrival + settle; **property owners' names on the map**; inset Plan of Ipswich Village | Yes, Allmaps; TIF 241 MB, JPEG 20 MB, IIIF | https://collections.leventhalmap.org/search/commonwealth:cj82ks45m |
| 1830 town plans for Wenham, Hamilton, Beverly, Salem, Lynn, Malden, Medford, Cambridge | The gap between Hales's NE edge and Ipswich | Varies | https://www.leventhalmap.org/articles/massachusetts-town-plans/ |

Historic Ipswich (historicipswich.net) has the house-by-house record for
the arrival beat: First Period houses, the wharf, Meeting House Green.

### The Howe house is on Linebrook Road, not the harbour

The existing aerial still puts "The Howe Family Home" on an invented Cedar
Lane above Careswell Cove. Historic Ipswich places the Howe homestead on
**Linebrook Road**, inland to the west: the Abraham Howe barn at
421 Linebrook Road (frame c. 1711–1725, NRHP) and at least six Howe houses
in that stretch. Elizabeth (Jackson) Howe, hanged 1692, was of the
Linebrook side of Ipswich.

**Confirmed on the survey (2026-09-09):** Anderson's 1831 map marks three
Howe houses in the Linebrook parish, on the road past the Line Brook
Meeting House and burial ground, between Allen Perley and John Perley
toward Cedar Swamp and Pritchard's Pond: **Aaron How**, **Mark How** and
**Abel How** (full-resolution IIIF pixels ≈ 1900,3900 / 1840,4080 /
1220,4240 on `commonwealth:cj82ks46w`). The settle beat lands there.
Still worth confirming which of the three the tree's own Howe line
occupied in 1810.

## Three ways to make it, and which to pick

### A. Keyframes plus frame-to-frame video (fastest, ~2 days)

1. Generate 6 stills in ChatGPT, one per beat, **each with a crop of the
   period map attached as a reference** so rivers, roads and village
   shapes match the survey. Same style prompt every time (below). Same
   altitude, same heading, same light.
2. Bridge each adjacent pair with a start-frame/end-frame video model:
   Veo 3.1 *Frames to Video* (8 s per pair, 1080p, has *Extend*), Kling
   start/end frame (5–10 s), or Runway Gen-4 *Keyframes*. Five pairs give
   40–50 s.
3. Stitch with short crossfades (ffmpeg command below), add the label and
   a music bed in any editor.

Strength: lands this week, matches the stills exactly. Weakness: the model
invents the ground between keyframes, so keep keyframes close together (no
more than ~8 km apart) and put the map crop in every reference.

### B. Real terrain draped with the period maps, then restyled (anchored, ~1 week)

1. Drape the Hales 1829 GeoTIFF and the Anderson 1832 map (export a
   GeoTIFF from its Allmaps annotation) over a USGS DEM in Blender
   (BlenderGIS) or QGIS.
2. Fly a camera along the route and render a flat-matte frame sequence.
   The map itself is the texture, so every road, river and village is where
   the 1830 surveyors put it.
3. Restyle the sequence video-to-video with Runway Aleph ("warm painterly
   1810 illustration, farms, woods, dirt roads, stone walls, no modern
   structures"), or use the render as the layout reference for Path A's
   keyframes.

Strength: the geography is literally true, and the terrain + camera path
are reusable inside Greg's three.js world as the geographic mode Katie
asked for. Weakness: a week of GIS and Blender before anything looks
finished.

### C. Google Earth Studio plus Aleph (not recommended)

Real terrain in an afternoon, but the corridor is 44 km of highways,
Route 128 and suburbs that Aleph would have to paint out frame by frame.
Only useful for exporting a camera path (3D Camera Export) into Path B.

### Recommendation

**Do A now, seeded with the map crops, and plan B as the product path.**
A gives Greg something to react to tomorrow. B is the version that belongs
in the app, and it is the same terrain-first thinking his layout study is
already reaching for (literal geography, parents' house first out of the
hub).

## Prompts

**Style block (paste into every keyframe request):**

> Warm, slightly painterly historical illustration, not photorealistic.
> Soft afternoon light from the south-west, gentle atmospheric haze toward
> the horizon, muted greens and ochres, hand-drawn line quality in
> buildings and stone walls. Bird's-eye view from about 600 metres, camera
> facing north-east. No modern roads, wires, cars or buildings. Same
> palette and brushwork as the attached Ipswich aerial.

**Beat 1 (Watertown):** "Watertown, Massachusetts, 1810, from above. The
Charles River bends through the centre with the mill dam and bridge at
Watertown Square, meeting house, scattered Federal houses along the main
road, orchards and hayfields beyond. Match the attached 1830 plan." Attach
the Hales Watertown plan crop.

**Beats 2–4:** one sentence naming the towns under the camera and the
water in view (Mystic, Saugus marsh, Salem harbour), plus the style block
and a Hales 1829 crop.

**Beat 5 (Ipswich arrival):** reuse the existing aerial still as the end
frame; it is already in the style.

**Beat 6 (settle):** "Linebrook Road, west Ipswich, 1810: a First Period
farmhouse and large barn among stone-walled fields, a dirt road, low
hills; the village steeple small in the distance to the east." Attach the
Anderson map crop of the Howe parcel.

**Video segment prompt (Veo/Kling/Runway, per pair):**

> Continuous aerial glide north-east at constant altitude and speed, no
> cuts, no zoom, camera does not tilt. Farms, woods, dirt roads, stone
> walls and small settlements pass beneath. Painterly illustrated look
> held steady from the first frame to the last.

For the final pair add: "slow descent and settle, then hold."

## Stitch

```bash
# five 8 s clips, 1 s crossfades
ffmpeg -i s1.mp4 -i s2.mp4 -i s3.mp4 -i s4.mp4 -i s5.mp4 -filter_complex "
[0:v][1:v]xfade=transition=fade:duration=1:offset=7[v1];
[v1][2:v]xfade=transition=fade:duration=1:offset=14[v2];
[v2][3:v]xfade=transition=fade:duration=1:offset=21[v3];
[v3][4:v]xfade=transition=fade:duration=1:offset=28[v]
" -map "[v]" -c:v libx264 -crf 18 -pix_fmt yuv420p flyover.mp4
```

Add the label as a drawtext filter or in the editor over the last 4 s.

## Honesty tags for the finished demo

Everything the camera passes is *period_typical* except what the surveys
put there: rivers, roads, village footprints and named parcels are
*documented* (1829–1832 surveys, not 1810, and the caption should say so).
The Howe house itself is *inferred* until the tree and the Anderson parcel
agree.

## Staged kit (2026-09-09)

`~/FlyoverDemo/` holds the runner (`flyover.py`, stdlib Python, reads
`~/.gemini-api-key`), the six beat prompts (`beats.json`), the style stills
and map chips (`refs/`), and the georeferenced Hales affine
(`maps/hales_affine.json`). Models: keyframes on Nano Banana Pro
(`gemini-3-pro-image-preview`, 16:9, 2K, map chip + style still as
references); segments on Veo 3.1 (`veo-3.1-generate-preview`, first + last
frame, 8 s, 1080p; `--fast` swaps to the cheaper model); stitch with
ffmpeg xfade and a drawtext label over the last 4.5 s.

```bash
cd ~/FlyoverDemo
python3 flyover.py keyframes          # ~6 images, review before spending on video
python3 flyover.py segments --fast    # 5 clips, cheap first pass
python3 flyover.py stitch             # -> flyover.mp4
```

## What the first run taught (2026-09-09)

- **Keyframes (Nano Banana Pro):** four of six were right first time. Any
  reference image that carries lettering (the ChatGPT aerial with its
  callouts, the survey chips with owners' names) makes the model paint
  labels into the frame. Fix: use an already-clean keyframe as the style
  reference, and for the worst case (Medford) drop the map chip and
  describe the geography in words. Saying "match the first image" with a
  same-region keyframe can also copy its composition; say "brushwork and
  palette only, do not copy the layout".
- **Veo 3.1 fast:** holds on the first frame with light parallax, then
  morphs into the last frame in the final second or two. Reads as
  dissolving paintings, not flight. Also drifts toward photoreal mid-clip.
- **Veo 3.1 standard + a forward-travel prompt** ("the first image passes
  beneath and behind, the last image rises over the horizon ahead; no
  holding still, no dissolve") gives a continuous glide with the painterly
  look intact. Worth the 2.7x price. Minor: Boston on the horizon can grow
  too tall; keep "small, distant, 1810 steeples" in the prompt.
- **Stitching:** the Mac's `/usr/local/bin/ffmpeg` is a 2018 build with no
  `xfade`; a current static build lives at `~/FlyoverDemo/bin/ffmpeg`.
  `drawtext` needs an explicit `fontfile` on macOS (Baskerville.ttc).
- **Cost of the full first pass:** ~9 stills + 5 fast clips + 5 standard
  clips ≈ $25.

## The shared-library shape (built 2026-09-09, `~/FlyoverDemo`)

```
library/legs/<from>__<to>__<era>/clip.mp4 + meta.json   # rendered once, reused; meta carries labels
library/places/<place>__<era>.png                       # keyframe stills
family/<slug>/family.json + settle.png                  # the only per-family AI asset (one still)
assemble.py family/<slug> out.mp4                       # xfade legs + local push-in + labels, all ffmpeg
```

Per-family marginal cost ≈ $0.13. Labels are free: leg labels in `meta.json`
(leg-local seconds + screen fraction), settle labels in `family.json`; the
assembler converts to absolute time by route position. Talking points for
Greg: the leg library is the cell-key cache from the rebuild spec applied to
flight; the settle beat is where his world takes over (the still becomes a
textured surface, the camera becomes code); labels stay data, never pixels.
