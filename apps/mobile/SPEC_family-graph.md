# SPEC: Family Graph (was "family stage") — navigation + contrast pass

Decided with Rufus 2026-08-23 (cemetery field-testing session). Four fixes
plus a naming decision and a contrast directive.

## Decisions (Rufus's calls, interviewed)

1. **Rename everywhere.** The feature is the **Family Graph**: the Portrait
   link, the screen's own eyebrow, the Tree-tab door, and the group sheet's
   "THEIR STAGE ›" all follow. Routes and file names stay (`/family-stage/`,
   `familyStage.ts`) — copy only.
2. **Dead-end taps do nothing.** Tapping a ribbon is *family navigation
   only*: parents (head/spouse) hop **up** to the household they were a
   child in; children hop **down** to the household they head. A ribbon
   with a hop carries an arrow badge (↑ / ↓); a ribbon without one is
   inert. The Portrait stays reachable through the FAMILY GROUP sheet.
3. **Contrast: labels AND chart inks.** Sunlight legibility. Darken the
   Letterpress muted/deepAmber label tokens substantially, decouple and
   darken the women's ribbon brown (white-on-brown names must read
   outdoors), and bump the smallest mono sizes (8.5 → 9.5).

## The four fixes

1. **Portrait**: "See this household as a length of time ›" →
   **"Family Graph ›"**, moved from the bottom of the register block to
   directly under the "House of …" running head.
2. **Portrait section titles** (PARENTS / BROTHERS & SISTERS / MARRIED …):
   significantly darker + larger (`theme.text`, semibold, 11px vs 10).
   The tappable MARRIED eyebrow becomes accent-colored so tappable and
   inert eyebrows stop looking identical.
3. **Graph ribbons are pressable** where a hop exists:
   - Up-hops derive from an inverse child→stage index (`useMemo` over
     `stages.byKey` — no new fetch).
   - Down-hops use the existing `child.mfam`.
   - The **direct ancestor** in each graph carries the lineage mark (⇅),
     the app's existing vocabulary, on the ribbon itself.
4. **Back is back.** `← FAMILIES` (`dismissTo('/register')`) becomes
   `← BACK` (`router.back()`, falling back to the register only when
   there's no history, e.g. cold deep links). Generation hops `push`, so
   back retraces the reader's actual path.

## Non-goals (this pass)

- The web broadsheet carrier (`components/broadsheet/family-stage.tsx`)
  keeps its own layout; it inherits only the token darkening. Its copy
  rename is included; its hop affordances already exist.
- No schema or core-query changes; everything derives from the loaded
  `FamilyStageIndex` and the relationship cache already in state.
