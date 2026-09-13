# Obituaries and death notices — the `obituaries` register

**Variant C, worker-fed** (the `va-burials` shape). No `records.csv`: the
source is every page of Chronicling America. The `obituary-leads` edge
function runs on pg_cron, searches a person's name in their state around
the death year, reads the OCR of the best pages, keeps only the passage
where the surname sits beside the words of a notice, and asks the model
what that passage says — strictly from the text. Pure logic in
`packages/core/src/registers/obituaries.ts`, mirrored to
`supabase/functions/_shared/records/obituaries.ts`.

## Source

- **Chronicling America**, Library of Congress, via the loc.gov JSON API
  (`?fo=json`, `fa=location_state:<name>`, `dates=YYYY/YYYY`, `dl=page`)
  and the text service (`word_coordinates_url` with `full_text=1`).
- Public domain (pre-1930 outright; later titles "no known restrictions").
- Limits: 20 JSON searches a minute, then an hour's block; the worker
  spends at most 8 searches and 16 page reads per ten-minute run and
  stops the run on a 429.
- Coverage 1756–1963, thickest 1836–1922, uneven by state.

## Why it matters for lines

None of the seven free federal sources gives a parent–child link. A
notice does: "survived by his wife, Mary, and by three sons, John, Henry
and Charles". `relativesAgainstTree` holds each named relative up against
the tree's spouses, children, parents, and siblings — a match is
corroboration, a miss is a **lead** (`saved_payload.leads`), which is the
research question Tree Health should carry. Witness never writes the
relative into the tree.

## What the card shows

Record name: the paper and date. Summary: the notice's kind and date, one
verbatim quote (OCR-corrected only for letter errors), and the relatives
it names. Reasons: the printed year against the tree's death year, the
name form found on the page, and one line per named relative. "View
source ›" opens the page on loc.gov. Confirming writes no event — the
death is already recorded; the notice becomes a provenance-labelled
block in "Their World".

## Confidence

`strong`: the model reads a death/funeral/obituary notice with a legible
full name AND (the page year is within a year of the tree's death year,
or a relative it names is already in the tree). Otherwise `probable`.
The model's `about_person: false` or `weak` is silence. Strong candidates
reach the findings ledger.

## Cost

One model call per passage read, roughly 1.5k input tokens; the tokens
ride in `saved_payload.ai` so the operator ledger can count them later.

## Widening

- Marriage notices (the model already classifies them) as a second
  register with a `marriage` confirm event.
- Tree Health check: "N obituary leads name relatives your tree lacks."
- Wider date window for people whose death year is estimated.
