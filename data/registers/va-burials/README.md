# Veterans’ gravesites — the `va-burials` register

**Variant C, worker-fed.** No `records.csv`: the source is 8.4 million rows
and lives on data.va.gov, so the `va-enrich` edge function queries it live
per person and writes `person_register_links` candidates with the record
snapshot in `saved_payload` (the NARA worker's shape on the registers'
tables). The pure scoring is `packages/core/src/registers/vaBurials.ts`,
mirrored to `supabase/functions/_shared/records/vaBurials.ts` for Deno.

## Source

- **National Cemetery Administration, Nationwide Gravesite Locator**, as
  published on the VA open-data portal: dataset `3u66-fxug`,
  https://www.data.va.gov/dataset/National-Cemetery-Administration-Gravesite-Locator/3u66-fxug
- Licence: CC0 / US government work. No key required; an optional
  Socrata app token (`VA_APP_TOKEN` secret) lifts the per-IP throttle.
- Fields used: decedent names, dates, suffix; cemetery name, address,
  city, state, zip, URL; section / row / site; relationship to the
  veteran and the veteran's names; branch, rank, war; `location_point`
  (the cemetery's coordinates, not the grave's).
- The public locator at gravelocator.cem.va.gov is updated daily; the
  open copy was last refreshed 2022-11-08. Burials after that are absent.

## What each feature gets

- **Portrait card** — "In the record books": the decedent as recorded,
  service line, cemetery, reasons; confirm writes a `burial` event with
  the cemetery and the provenance label.
- **Stories** — confirmed links reach the "Their World" prompt with the
  register's provenance label, like every register.
- **Map** — a confirmed link carries the cemetery's latitude/longitude in
  `saved_payload`; the Ancestor Map draws it as a record-book marker.
- **Lines** — a "Wife" / "Husband" row names the veteran; when that
  veteran is the person's spouse in the tree the reason says so.
  Son/Daughter rows name the veteran too, but the worker does not yet
  check parents.

## Matching rules (vaBurials.ts)

Death year must agree (exact +3, one year +1, else refused). Birth year
exact +3, within two years +1, further apart refused, unknown in the tree
is said aloud. Middle name agrees +2, initial agrees +1, conflicts −2.
Buried in a state the tree already records +1. Spouse-of-veteran with the
veteran found among the tree's spouses +2. Score ≥ 4 is offered
(`probable`) — an exact death year alone is not — and ≥ 6 is `strong` and
lands in the findings ledger. At most three candidates per person.

First dry run (`scripts/va-burials-dry-run.ts`, 2026-09-13, the Howe/Field
tree's 80 most recent deaths): 77 asked, 8 offered, 7 strong — Shirley
Scott Howe at the Massachusetts National Cemetery, Robert F. Girard at
Agawam, Jerome B. Davis at Augusta among them.

## Widening

- Parent check for Son/Daughter rows (needs the family-children join).
- A refresh path when the VA republishes the open dataset.
- Cemetery-level "Near me": the cemetery coordinates make "three of yours
  are buried here" possible from the record alone.
