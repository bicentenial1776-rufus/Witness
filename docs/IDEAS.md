# Ideas

Unscheduled product ideas — things worth building someday that aren't on the
V1/V2/V3 roadmap in PROJECT_BRIEF.md. When one gets scheduled, move it to the brief.

---

## Curiosities of the Record

**Added:** July 2026, from the temporal-query anomaly work.

Temporal queries silently exclude record anomalies — documented lifespans
over 100 years, deaths before births (see `MAX_DOCUMENTED_LIFESPAN_YEARS`
in `packages/core/src/query/aliveDuring.ts`). On the Howe/Field tree that's
5 people, e.g. Abraham Packard "1738–1928," a 190-year lifespan that almost
certainly means two same-name ancestors were merged into one record.

Instead of silent exclusion, give these a small surface — "Curiosities of
the record" — because each one is a research lead in disguise: a conflated
ancestor is a brick wall the user doesn't know they have. Natural tie-ins:

- A row at the bottom of temporal query results: "3 records couldn't be
  placed in time — see why"
- Each curiosity links to its ancestor and offers to start a Research Brief
  ("untangle the two Abraham Packards")
- Fits the brief's stated philosophy: "anomalies surfaced as curiosities,
  never corrected" — Witness never modifies the GEDCOM, it just points

Cheap MVP: the anomalies are already computed at classification time; the
query screen just needs to receive and render them.

---

## Blood-Collateral Relationship Precompute

**Added:** July 2026, from the "Your line" query filter work.

The relationships table precomputes direct ancestors only (~800 rows).
Uncles, aunts, cousins, and other blood collaterals are computed one at a
time by a live graph walk — fine for a single ancestor screen, too slow to
filter 300 query results. Extend `setHomePerson` to also precompute blood
collaterals (anyone sharing a common ancestor with the home person, i.e.
descendants of the direct-ancestor set), populating the existing
`is_collateral` column. Then the query filter's "Your line" chip can grow a
"Related" tier that includes cousins — the scope Rufus originally asked
for — and result lists can label cousins instantly. Watch compute cost:
the collateral set can be thousands of people on a 5,495-person tree.

---

## Suggest a Moment — AI-Authored User Queries

**Added:** July 2026, from the Explore/database-library work.

Users will always want temporal queries we haven't shipped ("the Dust
Bowl," "the Year Without a Summer," "Kennedy's assassination"). Asking
them to author year ranges and region scopes is too much lift for the
audience — but a query is now just five fields in the `historical_events`
table, and drafting those fields from one plain sentence is a reliable
one-shot AI task.

The shape:

1. A "Suggest a moment" box on Explore (one free-text sentence)
2. An Edge Function has Claude draft the structured event — name, years,
   region, one-sentence summary, keywords — from well-established history;
   refuse or flag anything ambiguous
3. The drafted event runs **immediately** for the suggesting user, stored
   with a `suggested_by` marker (private to them at first)
4. A lightweight review step promotes the best suggestions into the shared
   library — every good suggestion enriches every user's Explore tab

That last step is the compounding flywheel the brief promises ("more
history to connect to every year, without the user doing anything").
Guardrails: daily AI budget already exists; drafted events must pass sanity
checks (years within 1000–present, plausible region); slugs namespaced
(`user-` prefix) so they can't collide with the curated library.

Timing: post-TestFlight.

---

## Unconnected Branches (Tree Islands)

**Added:** July 2026, after Cornelius Stephanse Miller (1726–1810) surfaced
with no derivable relationship — he sits in a 35-person island with no
family link to the main tree. GEDCOMs accumulate these: research fragments
never joined to the main line. An Explore analysis could flood-fill the
family graph, list the islands ("3 unconnected branches · 82 people"), and
offer each as a research lead — reconnecting an island is a breakthrough,
and knowing it's disconnected explains every missing relationship label
inside it. Cheap: the component walk is the same graph already loaded for
kindred couples.

---

## All Shared Ancestors on Kindred Cards

**Added:** July 2026, from the full-depth kindred work.

A kindred couple's card shows only the *closest* shared ancestor (that's
what defines the cousin label). But couples often share several lines —
Rufus ⚭ Ruth connect through Abigail Maxey (closest) *and* the William
Haskell line. Add "…and N more shared ancestors" expanding to the full
list, each tappable. The sweep already computes the full intersection of
ancestor sets; it just discards everything but the minimum. Pairs well
with the relationship-path viewer for each line.

---

## Time Scrubber for the Ancestor Map

**Added:** July 2026, from the map-controls redesign.

The era segmented control filters by century buckets. The richer concept:
a decade-granular slider (1620 → present) sweeping a rolling ±25-year
window, so dragging it animates your family spreading across the map —
Plymouth to the frontier in one thumb-drag. Not a filter, an experience;
pairs naturally with iPad presentation mode, and the brief already
imagines a time slider for Family Street View. Needs marker
enter/exit animation to feel alive.

---

## Web Application Behind a Paywall

**Added:** July 2026, after the iPad install ("iPad is definitely a better
form factor overall") — the brief's V2 "web browser version," expanded.

The bigger the canvas, the more Witness feels like the research tool the
brief promises; the web is the biggest canvas. Three legs:

1. **Port, not rewrite.** The Expo/React Native codebase is universal —
   react-native-web is already a dependency and most screens (digest,
   queries, ancestor detail, relationship paths, FAQ) would render in a
   browser today. Real work concentrates at the native edges: a web map
   component, notifications, and a polish pass. Keep components
   platform-agnostic in the meantime; when a decision could go either
   way, lean toward the portable choice.

2. **The paywall economics.** In-app subscriptions give Apple 15% of
   $19.99; web billing (Stripe, or RevenueCat Web Billing — RevenueCat is
   already the planned subscription layer, so both channels unify) costs
   ~3% and, more importantly, owns the customer relationship: receipts,
   win-backs, family-plan gifting. The dual model (app for daily use,
   web for billing and deep sessions) is standard in this demographic —
   Ancestry and newspapers.com both run it.

3. **Web is the growth funnel.** Shared discovery cards and Annual
   Wrapped currently dead-end for non-users. With a web app at
   witnesslives.com (domain + Cloudflare DNS already in hand), every
   share links to a living preview → trial. The web app and the organic
   acquisition mechanic are the same artifact.

**Trigger:** post-iOS-launch retention data. If trial conversion and
week-4 usage look healthy, web-behind-paywall is the highest-leverage
next move. Not before TestFlight.

---

## Automatic Post-Import Geocoding

**Added:** July 2026, exposed by the second-account onboarding (Ruth's own
import). Geocoding currently runs as a developer script from a laptop —
an in-app import leaves the Map and Nearby tabs dark until someone runs
it manually. Needs to be a server-side job: an Edge Function (or queue)
that walks a tree's ungeocoded places at Nominatim's 1 req/sec after
import, so the map lights up on its own. The FAQ already describes the
intended behavior ("computed after import… fills in as places are
located") — this makes it true without a human in the loop. The shared
places cache across trees (same raw place string → same coordinates) is
now VALIDATED: Ruth's 3,812-place import got 3,664 coordinates copied
from Rufus's tree in seconds, leaving 4 for the live geocoder.

Also required: the app's in-memory geography cache lasts the whole
session, so a map opened before geocoding completes stays dark until the
app restarts (observed on Ruth's first run). The job should pair with a
client refresh — invalidate the geography cache when a tree's
geocoded_at count changes, or refresh on Map tab focus with a staleness
window. Prerequisite for TestFlight testers importing their own trees.

## "Beyond Your Tree" — Web Search at Story Time

**Idea (2026-07-05, from the Lewis Haskell Jr story):** for ancestors with
genuinely public lives (state senators, postmasters, clergy), let the
biography function optionally enable Claude's server-side web search and
render anything it finds in a visually separate, clearly labeled section —
"Beyond your tree" — never woven into the documented story.

**Why deferred:** same-name confusion is the classic genealogy trap; the
documented-facts-only prompt is the app's trust foundation. Any web-sourced
sentence must corroborate birth/death dates and places before appearing,
and the user should opt in per person. Roughly triples the pennies-per-story
cost. The near-term answer is better data instead: record what you know as
facts on the source platform, re-export, re-import (the importer now carries
occupations, custom events, and probate), and let research briefs point at
archives rather than assert facts.

## Parked Explore Cards (from the 2026-07-25 phone IA session)

Rufus's rule: no cards in the UI without data behind them. These two mocked Explore cards
are parked here until their capability exists:

- **"Paper Trails — reading census discrepancies."** Requires per-census extracted facts
  (ages, households) that Witness does not hold; the GEDCOM only carries census references
  inside citations. Path: port FTAnalyzer's CensusReference regexes to parse census
  citations, then a discrepancy view. Pairs with the Tree Health census-coverage inference.
- **"Ellis Island & Beyond — immigration record types."** Requires immigration/naturalization
  events. The importer keeps occupation/military/probate/custom but drops IMMI and NATU;
  extending the importer (plus a backfill re-import) unlocks this card and the Tree Health
  immigration-consistency checks.

(Considered and rejected outright, not parked: a "% traced" completeness metric — dropped
by Rufus 2026-07-25.)

---

## Generational Line History (re-read and share past lines)

**Added:** September 2026, from Rufus fleshing out the daily-line story
(deliberately unbuilt — no user has asked yet; expected to surface within a
month of family-sharing seats being taken, as "what was that line from
Tuesday?").

Home shows one founder-to-reader line per UTC day, picked by
`founders[dayNumber % pool]` (~1,003 founders on the Howe/Field tree ≈ 2¾
years per cycle, reshuffling whenever the tree changes). A 3×-a-week reader
never sees ~57% of lines. The idea: let the reader reach back to a past
line, re-read it, and share it.

**What already exists (more than expected):**
- Arcs are cached server-side per founder forever — the nightly warmer
  means the "archive" accretes today as a side effect.
- Rebuild-on-refreshed-GEDCOM is already the caching contract (staleness
  signals: home person, individual count, ancestor count → retold on first
  sight). A history view needs no new rebuild machinery.

**The sticky parts (found in advance):**
1. **Identity across re-imports.** Arc rows key on founder row ids, which
   are reassigned every refresh — the history's unit must be
   *(day, founder gedcom_xref)*, prose retold on demand (the corrections
   lesson: stable fact keys, never row ids). Never store old prose as the
   record.
2. **Disqualified lines.** A correction can remove a founder from the pool
   (gains parents, drops below depth 6). Latent bug: generate-story-arc
   silently falls back to today's pick when given an unknown founderId — a
   history needs an honest "this line no longer runs — a correction changed
   it," which is the *good* outcome (the history records the tree getting
   truer).
3. **Sharing truncation.** Lines run founder-to-reader; nothing shareable
   may include a living person, so a shared line truncates at the last
   deceased generation. share_links handles mechanics; truncation is the
   design call.

**The cheap ladder (build only as demand appears):**
1. Share button on *today's* line (likely the actual first ask) with
   living-generation truncation.
2. "Yesterday's line ›" — nearly free; any past day's pick is computable
   from the modulo while the pool is unchanged.
3. Only if readers reach past yesterday: a read-marks table
   (day + founder xref, the ancestor_visits pattern) as the durable
   personal history that survives pool reshuffles. This is also the
   substrate for a drained per-reader rotation ("next unread line ›") if
   cadence-independence is ever wanted.

---

## Ask a Real Question (Explore question-answering)

**Added:** September 2026, after Rufus asked Explore a natural-language
question and got "Nothing matches." The feature is honest-by-design — a
question NOTEBOOK wired to keyword search, on-device only, no AI anywhere
(saved-questions.ts) — but the old label said "Ask your own question" and
set up an answer. The label was fixed to match the behavior; these are the
two rungs above it, to build "when it's time" (Rufus, 2026-09-02):

1. **Deterministic extraction** (small, no AI): pull proper nouns and
   years out of the sentence and run THOSE through the existing engines —
   "who was the first Howe in Vermont?" → searches Howe + Vermont. A
   tokenizer + capitalization/roster heuristics; no cost, no guardrail
   questions, meaningfully better than phrase-matching.
2. **Question routing** (a real feature): an edge function that maps a
   question onto the query engines the app already has (temporal
   aliveDuring, geographic, structure, kindred) and returns real results —
   the thing the paywall's "Ask any temporal query" bullet gestures at.
   Needs its own design pass: model choice, cost ceiling per question,
   decline behavior (silence over guessing), and what happens to questions
   no engine can serve (they stay in the notebook — that part already
   works).

Guardrails today, for the record: nothing leaves the device except the
tree-scoped keyword RPC; saved questions never sync; there is no model
call. Any rung above keeps the notebook semantics — a question that can't
be answered yet is kept, not lost.

---

## Tree Pulse (GEDCOM Refresh) on iPhone/iPad

**Added:** September 2026, from Betsey's 2026-09-07 beta call
(`docs/beta-feedback-betsey-2026-09-07.md`).

Her single biggest complaint was sync friction: FamilySearch has no export
of its own, so every tree change means FamilySearch → RootsMagic (sync) →
GEDCOM export → re-import into Witness, by hand, from scratch, every time.
This is already a known rough edge — `docs/competitive-treelab.md:195-199`
calls "each upload creates a new tree" *"our roughest shipped edge"* — and
Tree Pulse / GEDCOM Refresh (diff a re-upload against the saved tree,
report what changed, replace instead of duplicate) is already built and
shipped in the browser (`packages/core/src/pulse/refresh.ts`). The preview
site copy already promises it "on iPhone and iPad in the next release."

Betsey only uses the iPad. For her, and for anyone else who came in through
FamilySearch/RootsMagic rather than the browser, this is a "ship the
existing fix to the surface people actually use" item, not new design work.
Worth confirming where it sits in the mobile build queue given a real user
just independently named it as her top frustration.

---

## Simplify the FamilySearch "partner software" copy

**Added:** September 2026, from Betsey's 2026-09-07 beta call.

The import guide's FamilySearch blurb (`apps/mobile/src/constants/gedcom-
guide.ts:54-63`) opens with "No export of its own — use free partner
software" and explains that FamilySearch's API "is open to certified
partner programs." Betsey, a non-technical user, hit this screen and said
plainly: "I didn't know what that meant." The explanation is accurate but
front-loads API/partner-program vocabulary before saying what to actually
do.

Idea: rewrite the headline as an instruction, not a mechanism — something
like "FamilySearch won't let any app pull your tree directly. We'll walk
you through the free 5-minute workaround (RootsMagic)" — and push
"certified partner program" language down into supporting detail for
readers who want the why. Cheap copy change; the audience (comfortable-
with-technology-but-not-technical family testers) is exactly who this
screen needs to work for.

---

## Explain FamilySearch re-authentication when it happens

**Added:** September 2026, from Betsey's 2026-09-07 beta call.

Mid-demo she was unexpectedly asked to sign in again ("with Google or some
other kind of thing") to reach FamilySearch records, and hadn't seen that
before — almost certainly an expired session token, not a bug. Her
reaction ("if that came up, I would have absolutely no idea what to do —
I'll be calling 911, no joke") is a useful data point on how little runway
a confused-but-willing user gives an unexplained auth wall. Idea: when a
FamilySearch session has expired, show a short in-context line before
handing off to the sign-in screen — "Your FamilySearch link expired; sign
in again to keep syncing" — rather than surfacing a bare login prompt.

---

## Confirm onboarding fires per-install, not just per-account

**Added:** September 2026, from Betsey's 2026-09-07 beta call.

She saw the welcome/tutorial flow for the first time this call, on her
phone — and said she'd never seen it on her iPad, which she's used for
weeks. Likely just means she got a fresh install on the phone and
onboarding is (correctly) per-install; worth a quick check that it isn't
silently being skipped on one platform for an account that's already
"seen" it elsewhere, which would quietly rob every iPad-first tester of
the welcome flow.

---

## Digital Commons Collections as a Register Source (parked)

**Added:** September 2026, from scouting theancestorhunt.com's "Digital
Archives" page, which links out to hundreds of local historical/
genealogical societies' collections hosted on Digital Commons (the
bepress/Elsevier institutional-repository platform used by 600+
universities and libraries — each institution runs its own separate site,
no unified catalog across them).

**The mechanism, worked out but not built:** every Digital Commons
repository exposes its metadata for free via OAI-PMH (no credentials
needed — distinct from Digital Commons's owner-only "Outbound API"). A
harvester script would pull Dublin Core metadata (title/creator/date/
subject/identifier) from one institution's OAI-PMH endpoint into a raw
CSV; a human curation pass (splitting names, extracting years — Dublin
Core has no given/surname split, so this can't be automated) turns that
into a register's `records.csv`; from there it's the existing
`seed-register.ts` pipeline, unchanged. Cheaper alternative for one-off
collections: skip harvesting entirely and add a Variant C deep-link
(`packages/core/src/registers/deeplink.ts`'s `fillDeepLink`) straight to
the institution's own search page, if it takes query parameters.

**Why parked, not built.** Ancestry/FamilySearch already own the
standardized record types (census, vital, immigration, military) —
Digital Commons doesn't compete there. Its real edge is hyper-local
material those platforms never digitized (a county's WPA cemetery
survey, an unpublished family-history vertical file) — genuinely
exclusive, but each collection is its own institution-specific curation
effort for a narrow, unpredictable slice of trees (only users with
ancestors from that one county), a worse effort-to-reach ratio than the
locked build order's broad registers (Acadian, Civil War, GLO, Loyalists),
which each touch a large population of trees. It also cuts against
Witness's "reader of people" positioning: most Digital Commons items are
raw record fragments, not the narrative-rich material (a regiment's real
campaign, a deportation's real voyage) the registers are built to surface.

**Revisit trigger:** a specific collection tied to something broad (an
ethnic group, a major migration, a widely-researched region) rather than
a single town — evaluated opportunistically, not as a general pipeline.

**Note for whoever picks this up:** a Claude Code web/remote session's
sandbox can't reach arbitrary external domains (egress is allowlisted to
package registries and GitHub) — testing an OAI-PMH endpoint needs a
local machine or a session with open network access.
