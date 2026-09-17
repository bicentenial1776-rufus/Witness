# Rufus's web-app walkthrough notes, September 2026

**Format:** Rufus's own notes from using app.witnesslives.com, handed over
the evening of 2026-09-16 after 1.9.0 (build 18) was submitted. None of
these are in that build. **Target: the next release (1.9.1).** Status
checked against main at 0205d4d the same evening.

## Explore

- [ ] **"Open full page" appears in the results drawer, then disappears
  after about a second.** The link exists (`components/broadsheet/query-drawer.tsx`);
  the vanishing is a bug, not a design choice. Needs a repro on web first.
- [ ] **The arrow after the list filter is too small.** Clicking the label
  already works, so drop the arrow and use clearer wording: "Show filter"
  / "Hide filter".
- [ ] **Returning to the Explore list does not return to the searched
  list.** The search is local component state (`(tabs)/explore.tsx`), so
  it resets on every return. Keep it — route params or a small store.

## Portrait card

- [ ] **Location label is clickable — no arrow needed.** The `›` is still
  appended to the birthplace (`ancestor/[id].tsx`, the `${birthPlace} ›`
  line).
- [ ] **Icon after the name needs to be 50% bigger.** The kin mark on the
  Portrait header uses `KinName`'s 12-point default (`components/kin-line.tsx`).
- [ ] **Add a show/hide map label.** No toggle exists today.
- [ ] **Map should zoom in and out.** `components/place-map.tsx` sets
  `zoomEnabled={false}` on purpose ("panning and zooming belong to the
  Map screen"). Adopting this reverses that decision — Rufus's call, made
  2026-09-16: do it.
- [ ] **No need for "Son of / Daughter of" below the map** — the overview
  already says it. Still rendered (`ancestor/[id].tsx` ~line 1809).
- [ ] **Contrast is too subtle: lighter background, darker text.** The
  light theme is deep ink `#1C1917` on parchment `#F7F3EE`
  (`constants/theme.ts`, untouched since the Large Print Edition,
  2026-08-24). Check whether the web export renders the serif lighter
  than native before changing colors; may be a font-weight problem on
  web, not a palette one.
- [ ] **The note after the story should expand with a handle instead of a
  scroll bar.** Betsey's box is a fixed `minHeight: 96` multiline input.

## Tree

- [ ] **The tree name is very large and long.** Make it smaller and show
  when it was uploaded. The masthead (`(tabs)/tree.tsx`) shows the full
  name; the upload date only appears on the home tab for seven days after
  import.

## From the records

- [x] **Pierre Doiron — "view source" opened a whole book.** Done 2026-09-16
  (other session): Crossing candidates link to their source page and the
  scanned register opens at the register line, not the surname
  (17a0d05, 77ebf11).

## Overall

- [ ] **The two pinned questions in the Library aren't real queries but
  are presented as such.** Confirmed, and worse: the pins (`alive-civil-war`,
  `alive-revolution` in `library_pins`) point at ids that do not exist in
  the question catalog — orphans from an earlier Explore flow. Either turn
  the "alive during" moments into real catalog questions or drop pinning
  for them, and clean the orphan rows.

## More to come

Rufus said he has a few more. Append below as they arrive.
