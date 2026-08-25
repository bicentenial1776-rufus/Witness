# SPEC: Offline field mode

*Rufus's scenario (2026-08-24): standing in a cemetery with one bar of LTE
fading to SOS. Witness should function at a basic level with no data
connection: look up an ancestor in Explore, view the Family Graph. No map,
no story generation. The core scenario is a simple look-up.*

## What the code does today (traced 2026-08-24)

**Launch.** The router gates the app behind `session && isEntitled`
(`app/_layout.tsx`). Fonts and the narrative flag are local. The Supabase
session restores from AsyncStorage without network. Entitlement is the
seam: `purchases/provider.tsx` nulls customer info on every mount (fail
closed by design), then calls `Purchases.logIn`. The RevenueCat SDK caches
customer info and identity on device, and a same-user `logIn` should
short-circuit to cache — so a phone that has opened Witness online before
*should* open offline — but if that call does touch the network and fail,
the reader lands on the **paywall**, in a cemetery, owning a subscription.
Both loading ceilings are 5s, so worst case the splash also eats ~5–10s.

**After launch.** `ActiveTreeProvider` fetches the trees list live; offline
it sets `loadFailed` and `activeTree` stays undefined — every screen shows
"couldn't reach your trees." Explore search is a server RPC
(`search_people`). The Family Graph builds from `getTreeIndex` →
`fetchTreeIndex`, a paginated full-tree fetch. All three die without a
connection. So today: the app may open, but nothing inside it works.

**The lever.** `TreeIndex` (individuals with names/sex/years/living,
families, family_children, events with types/years/place ids, places) is
already a complete snapshot for the look-up scenario, already fetched into
a session cache whenever the Tree tab or graph is opened online, and
`buildFamilyStages` is pure local compute over it. Persist that one
structure and both target surfaces work offline.

## The plan

1. **Persist the TreeIndex to disk.** After any successful
   `fetchTreeIndex`, write it as JSON via expo-file-system, keyed by
   `treeId` + the tree's `imported_at` (a refresh invalidates the copy).
   ~2–4 MB for an 8.6k-person tree; automatic, no "download for offline"
   chore. The index is warmed once per session after the trees load, so
   the copy is as fresh as the last online launch — the field never
   depends on having visited the Tree tab. Hydrate `tree-index-cache`
   from disk when the live fetch fails **or times out** — on one bar,
   requests hang rather than fail, so the offline path engages on a ~4s
   timeout, not only on hard failure.

2. **Persist the trees list.** Cache the `TreeRow[]` (tiny) in
   AsyncStorage on every successful load; `ActiveTreeProvider` falls back
   to it when `refresh()` fails, so `activeTree` resolves and screens
   mount. `loadFailed` still flags staleness.

3. **Explore search, local path.** When `search_people` fails/times out,
   filter the persisted index by name (given/surname/full-name contains,
   the RPC's ranking approximated client-side), with a quiet line marking
   results as from the saved copy. Person search only — place/event search
   stays online.

4. **The Family Graph** needs nothing new once (1) lands — the screen
   already builds from the index. Lineage marks degrade gracefully by
   design (best-effort tier map).

5. **The Portrait, degraded.** A search hit has to open somewhere. The
   index can render identity, vitals, and the full family register
   (parents/spouses/children, birth order) locally; live-only sections
   (Story, Their World, citations, corrections, NARA, burial record)
   collapse to a quiet "needs a connection" note.
   **DECIDED (Rufus, 2026-08-24): the degraded Portrait ships in v1** —
   the look-up has to answer questions at the headstone, not stop at a
   card.

6. **Entitlement grace.** ~~Verify the launch seam~~ **VERIFIED (Rufus's
   iPhone, airplane-mode cold start, 2026-08-24): the app opens offline** —
   RevenueCat serves cached entitlement, the router passes. No grace
   window needed. (The 7-day decision stands on file should a future SDK
   or provider change regress this; re-test after RevenueCat upgrades.)

7. **Writes in the field are out of scope for v1.** Visited stars,
   corrections, burial confirmations quietly no-op offline (verify they
   fail silently, not loudly). Queue-and-sync is a later chapter.

## Non-goals (v1)

Map tiles, Near Me, story/synthesis generation, AI anything, GEDCOM
import/refresh, web (the field device is a phone), multi-tree switching
offline beyond the persisted active tree.

## Verification

Device, not sim: airplane-mode cold start (launch seam), then 1-bar
simulation via Network Link Conditioner (the timeout paths), walking:
open app → Explore → search a name → open hit → open Family Graph.
