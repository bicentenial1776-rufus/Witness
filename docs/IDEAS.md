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
