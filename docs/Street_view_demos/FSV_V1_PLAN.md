# Family Street View — V1 plan

*Written 2026-08-05 by Rufus, against `FSV_PROJECT_BRIEF_2026-08-04.md` §12.*
*The brief is authoritative on **what FSV is**. This document is only about **what to build first, and in what order**.*

---

## 1. The thesis

**V1 is the repo's existing thin slice grown to the demo's field quality, with hand-authored chapters, on the Howe/Field tree, verified on a real iPad. No generated prose.**

Three facts drive that shape:

- `packages/streetview` + `apps/streetview-lab` is *already* GEDCOM → SceneSpec → walkable field on three r178. The spine exists; it is thin, not absent.
- `howe_field.html`'s `RAW` is field-for-field compatible with `HouseholdSpec`, so the canonical field is one adapter away from being a golden fixture.
- The Scrivener and the discovery engine are **still in the missing zip** (brief §12.1). Anything that depends on generated prose is blocked on a delivery we do not control.

So V1 takes its *writing* from `the-long-field.html` — authored by hand, at that bar — and uses `discoveries.json` only to decide **which** chapters are worth authoring and **where** they are sited. Generated prose is V2, and it arrives behind the writing gate when the zip does.

**The V1 definition of done:** a first-time 55+ user opens Witness, enters the field from Family Stage, always knows where they are, walks the Howe/Field centuries, enters six to eight chapters at their real household sites, and leaves with a Family Book of what they witnessed — at a comfortable framerate on an iPad, with every presented detail carrying its honesty tag.

---

## 2. Sequence

### Stage 0 — Unblock and pin (start here; ~1 short session)

The cheapest work with the highest leverage, and it de-risks everything after it.

1. **`RAW` → `SceneSpec` adapter.** Extract the 1,829-record array from `howe_field.html` into `packages/streetview/fixtures/howe-field.scenespec.json`. Resolve the two known mismatches: normalise `RAW.s` (banded 40–90) onto `HouseholdSpec.score` (0..1), and decide whether `nk` is a second child count the spec needs or a demo artefact to drop.
2. **Make it the golden fixture.** `apps/streetview-lab` renders the real 1,829-household field immediately, instead of whatever it renders today. Every later change is now measured against the canonical layout rather than a synthetic one.
3. **Move `atani.ged`** to `packages/core/fixtures/` (rebuild spec §5). Two corpora from the start is what keeps the model from going quietly Anglo-specific.
4. **Settle the three.js version deliberately, as its own gated task.** The mandate is **r128** (`FSV_DEVELOPER_PROMPT_2026-08-04.md` §42, and its "do not upgrade three.js in passing"). `apps/streetview-lab` is on r178 and predates rev. 3, so it is the deviation. Either bring the lab back to r128, or adopt r178 explicitly with Greg's sign-off and amend the developer prompt. **Do not let Stage 1 decide this by accident** — it is the one item here that must not be resolved by whichever code gets written next.

*Exit:* the lab renders the canonical field from a versioned fixture, `packages/streetview` has a regression baseline, and the three.js version is settled on the record rather than by default.

### Stage 1 — Field parity

Close the gap between the repo's boxes-and-prisms field and the demo's. In priority order, because each is separately visible to a user:

- **Era building cultures.** The engine currently varies wall colour and roof pitch by era. The six cells need to read as six building cultures. This is where `architecture_module.js` would land — and it is in the missing zip, so build the seam now and the parametric kit behind it when the zip arrives. Do not block on it; a materially better six-cell treatment is achievable without it.
- **Evidence bands as atmosphere.** `documented` / `partial` / `lost` / `living` already branch in `engine.ts`. Raise `lost` from a ghost platform to genuine fog-and-shadow, and make `living` legibly *withheld* rather than merely unlabelled. This is §5's "missing data is the terrain" and it is currently the weakest-carried design position in code.
- **Wayfinding, as a first-class gate.** District landmarks on the horizon, the road network, and a persistent "where am I / where next" affordance. Per brief §2 this is a hard requirement, not polish, and it should have a failing test before it has an implementation.
- **The year→radius curve frozen** (rebuild spec §3). Store the curve, freeze existing plots on insertion. Cheap now, extremely expensive to retrofit once anyone has bookmarked a world.
- **The asset-pipeline seam** (brief §12.4). Greg's approval loop starts producing reviewed elements *this week*, so the import path should exist before the assets queue up behind it. Three pieces, all small if built now:
  - **`AssetSpec` v1**, versioned beside `SceneSpec` v1, with a required **provenance tier** field (most vegetation is *Period typical*). Agree the schema with Greg rather than inferring it from his first export.
  - **A gated import**, not a drop-in folder. Approved-by-Greg still passes the architecture gate and the mesh budgets — they check what his eye does not.
  - **A cost table to hand back**, expressed as **variants per species** rather than triangles per asset — *"12 oaks at 400 triangles buys unlimited scatter; 200 unique oaks costs you the frame."* §6 makes this engineering's half of the bargain, and stated that way it is a budget Greg can design against instead of meeting at integration.
  - **A build-time bake step.** Per brief §12.4, the envelope is the authoring format and instanceable variants are the shipping format: sample ~8–12 variants per species per era from the approved envelope, then scatter them via `InstancedMesh` with per-instance rotation, scale and colour jitter. Generating unique geometry per instance defeats instancing and lands ~800k resident triangles where instancing would cost ~3k — §9's 297 MB problem arriving through a different door. Hero assets skip the bake and stay frozen.

  Build the seam so it accepts both shapes an approval might take — a frozen mesh *and* a parameter envelope — because the bake is a recommendation pending Greg's confirmation (brief §12.4) and the answer may differ per category.

*Exit:* the field is walkable, legible, and stable under tree growth; the accessibility and wayfinding gates pass; approved assets have a gated path into the build.

### Stage 2 — The chapter contract, and one chapter end to end

Do **one** chapter completely before authoring any others. This is the stage most likely to surface an unpleasant surprise, so surface it on one chapter rather than eight.

1. **Formalise `ChapterSpec` v1** from `the-long-field.html`'s `SPEC.scenes[]` — `id`, `cell`, `year`, `era`, `place`, `title`, `quest[3]`, `persona`, `fact`, `card_atmos`, `reveal`, `npc[4]`, `objects[][5]`, `pal{8}` — versioned beside `SceneSpec` v1, with the same privacy rule enforced at generation time.
2. **Add the honesty tag to the contract itself.** The Long Field's scenes carry facts but not the *From the record / Inferred / Period typical* tag that §5 requires on every presented detail. It has to be a required field on every object beat and reveal, or it will be applied inconsistently by hand.
3. **Build *Where the Rivers Meet*** (1943, Maine) as the vertical slice: staged at the real household site in the field, interior, named period figures, three-beat objects, the keepsake, the Sexton's turn, and the journal entry. It is the demo's closing chapter and the emotional payload of the whole walk — if it lands, the format is proven.
4. **Stand up the writing gate now, even without the Scrivener.** The gate is independent of who wrote the prose: fail any build whose fact beats lack a year or lifespan, whose reveals are missing, or that leaks a raw GEDCOM string. Hand-authored chapters should have to pass it too — that is what makes generated chapters droppable into the same slot later.

*Exit:* one chapter is enterable from the field and passes the writing, architecture, and accessibility gates.

### Stage 3 — The remaining chapters, sited by evidence

Author the other five to seven. **Use `discoveries.json` to choose them**, which is the first real use of the discovery engine in the product:

- Filter to `convergence`, `deep_line`, `immigrant`, and `anomaly`. The `history` detector is 89% of the candidate pool and none of its output ranks near the top — it is proximity to a gazetteer event, not a story.
- **Apply a tonal budget.** Do not sort by score alone. Moods in the file run 62% negative (grief 1,220, dread 968, hardship 674) against warmth 13 and awe 3. A pure score sort produces a relentlessly grim walk for a 55+ audience. Fix the mix at authoring time in V1; make it a director constraint in V2.
- **Fix the married-surname collapse first** (brief §12.3). Until it is fixed, the highest-scoring candidates read as "Irving C Howe m. Carrie E Howe" and cannot be used.
- Cross-check against the seven chapters the brief §1 already names. Where the engine independently surfaces a chapter Greg hand-picked, that is the strongest available evidence the scoring generalises — and worth recording explicitly.

*Exit:* six to eight chapters, staged at real sites, tonally varied, all gated.

### Stage 4 — Device truth

Per brief §10.4, and not deferrable to the end. Everything above has been headless; **nothing has been verified on glass.** Run on a real iPad from the first field render in Stage 0, not once at Stage 4 — this stage is where it becomes a standing gate rather than an occasional check: framerate, thermals, and the 297 MB stage-3 ceiling under batched building, plus 55+ readability, comfort and wayfinding with a first-time user who is not us.

### Stage 5 — Witness integration spike

WebView embed, the data bridge, entry from Family Stage into the field, and the formal privacy layer extending the living-band withholding into stated, tested policy.

---

## 3. Explicitly out of V1

Naming these keeps them from arriving by accident.

| Deferred | Why |
|---|---|
| Generated chapter prose (Scrivener) | Blocked on the missing zip; highest-variance part of the product. The gate and the `ChapterSpec` slot are built in V1 so it drops in cleanly. |
| Automated spine assembly | `discoveries.json` informs authoring by hand in V1. Only 3 spines emerge from 4,579 candidates — see the open question below. |
| Token-generated portraits and conversations | Brief §7, design-in-progress, explicitly uncommitted. |
| Home base | Brief §7. Worth revisiting *early in V2* on wayfinding grounds alone — a fixed familiar anchor is the strongest wayfinding device available for this audience. |
| Rivers, water, advanced landforms | Greg's active design front (§6). Build the seams; do not decide the design. |
| Any second family tree in the product | Howe/Field is V1's corpus. `atani` stays a test fixture, guarding against Anglo-specific assumptions. |

---

## 4. Gates that must exist before the code they guard

Per rebuild spec §5 — everything that broke was in a pure layer, and all of it was findable without a GPU.

- **Layout audit** — every profile × every child count × every band, OBB overlap, door swing, sightlines. Assert zero.
- **Site** — platforms level to 20 mm; no complex corner overhanging its pad; no corridor over gradient; no path crossing a foreign platform.
- **Model regression** — run the fixtures, assert the known counts: 43 chronological impossibilities, 0 cycles, 22 unnamed heads, 341 interior-less doorways. These numbers are the contract with reality.
- **Writing** — year/lifespan present, reveals present, no raw GEDCOM leakage, honesty tag on every beat.
- **Accessibility** — type size, tap target, contrast, persistent wayfinding affordance. Brief §2 makes these product requirements; they should fail a build.
- **Patches must assert.** Every silent no-op in this project came from a string replacement that matched nothing and reported success.

---

## 5. Open questions to put to Greg

1. **The zip.** It is the only outstanding item and it gates Milestone 2. V1 as scoped above does not need it — worth telling him that, so it does not read as a blocking ask.
2. **Three spines from 4,579 candidates** — hard cap in the director, or the natural yield of the scoring? §2's "thousand unique experiences" depends on which.
3. **`nk` in `RAW`** — a second child count the spec should carry, or a demo artefact to drop?
4. **Tonal budget** — is the grim skew a bug in mood assignment, or an honest reading of a 17th–19th century New England record that the director should balance rather than correct?
5. **The asset loop: does an approval freeze a mesh, or a parameter envelope?** (brief §12.4). The three-layer model wants the envelope — profiles are data, and variety at scale is what §2's thousand-experiences requirement rests on. A hybrid is likely right: envelopes for the scattered mass, frozen heroes where the aesthetic ceiling justifies the memory. Needs his call per category, and needs our cost table in his hands first.
6. **The `AssetSpec` schema** — can he share the JSON shape his loop emits, before the first batch of trees is approved? Agreeing it now costs a conversation; retrofitting it costs a translation layer we maintain forever.
