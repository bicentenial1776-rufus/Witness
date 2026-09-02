# Acadian Deportation register (Grand-Pré, 1755)

**What the rows are.** The 335 men and boys of the Minas country whom
Lt.-Col. John Winslow's roll records as imprisoned at Grand-Pré before the
October 1755 embarkations — names exactly as the roll spells them, with the
roll's own annotations (fils, absent, "le Vieux") carried in notes. Facts
only; nothing inferred.

**Provenance (the amended rule, Rufus 2026-09-02).** The roll's original is
the 1755 manuscript of Winslow's journal (Massachusetts Historical
Society) — public domain everywhere. No pre-copyright printing carries the
name roll (the NSHS *Collections* III/IV print of the journal has the
narrative and letters only), so rows take the **facts-not-expression**
posture (the Ark & Dove precedent): bare facts of the PD record via an
accessible reproduction, never its annotations or identifications, citing
both the record and the finding aid —
https://www.acadian.org/history/acadian-prisoners-grand-pre/ .
acadian-home.org, WikiTree's Acadians Project, Acadians in Gray, and
Stephen White's *Dictionnaire* are finding aids / never ingested.

**Deliberately absent from v1** (each a data-file widening later):
- Winslow's village census with sons/daughters counts (the famous
  household return) — no reachable clean reproduction carried it; first
  widening once one is transcribed.
- The Chignectou ships to South Carolina/Georgia — named EMBARKATION
  returns do not survive; SC arrival-side named rows only if a PD primary
  is found.
- Pisiquid — no reliable list exists (locked out of scope).
- Translated dit-names (LeBlanc⇄White, Bourg⇄Burke) in the normalizer —
  they flood Anglo trees; need a tighter gate.
- 1758 Île Saint-Jean ships to France; the French refugee rolls printed in
  Gaudet's PD 1905 archives report (Cherbourg, Saint-Malo — genuinely
  PD-printed named rows, a strong widening candidate).

**Files.** `records.csv` (the roll), `name-variants.json` (versioned
normalizer table v1 — canonical → variants, deterministic folding only),
`register.json` (exposure/match config + the "?" explainer). The match
plugin (origin/destination promotion) lives in
`packages/core/src/registers/normalizers/acadianNames.ts`.

**Seeding + running.**
```bash
cd packages/core
npx tsx scripts/seed-register.ts ../../data/registers/acadian-deportation
npx tsx scripts/match-registers.ts --tree <treeId> --report
npx tsx scripts/match-registers.ts --tree <treeId> --write
```
