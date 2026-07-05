# Ideas

Unscheduled product ideas — things worth building someday that aren't on the
V1/V2/V3 roadmap in BRIEF.md. When one gets scheduled, move it to the brief.

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
