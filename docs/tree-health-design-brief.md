# Design brief: Tree Health — the forensic audit

Companion to the home-screens brief. You are designing **Tree Health** for Witness: a
forensic evaluation of the user's family tree, inspired by the Genealogical Proof Standard.
The reference artifact is a manual 36-question scorecard (8 categories, pass/caution/fail
per question, notes, a weighted health score). Witness's twist: **most of it should not be
a questionnaire — the app already has the data to answer many questions itself.** Your job
is to design the experience where computed verdicts, machine-flagged suspicions, and human
attestations live together honestly.

## The four tiers — design each differently

**Tier A — Computed verdicts (~13 checks).** Witness evaluates these automatically, with a
named list of offending people behind every verdict. Never show a bare pass/fail — every
verdict is evidence-first, and every flagged person taps through to their ancestor page.

Already detected at import today (a `curiosities` system, currently shown once during
onboarding and never again — this feature gives it a permanent home):
- Death date before birth date
- Mother too young / too old at a child's birth; father outside plausible span
- Implausible lifespans (110+)
- Marriage before birth; suspicious sibling birth-date gaps

Computable from existing indexes and tables:
- Likely duplicate people (same name, close dates) — exists as `duplicateCandidates`
- Marriage-vs-children chronology (child born years before the marriage → flag, worth a
  "pre-marital birth or missing earlier marriage?" framing, not an error)
- Source coverage per person and per family line — who has zero citations, which lines are
  evidence-rich vs. thin (exists as `lineDocumentation`); note: citations attach to people
  and families, not to individual facts — coverage is person-level, and the design must not
  promise fact-level sourcing
- Compiled-genealogy detection — source titles matching "Ancestry Family Trees",
  "FamilySearch", "Geni", "One World Tree" etc. flagged as *finding aids, not proof*
- Anachronistic place names — event year vs. a small static table of state/province/country
  formation dates ("West Virginia" on an 1840 event)
- Migration-jump flags — implausibly long geographic leaps between consecutive generations
  (migration paths + distance already computed)
- Death clusters vs. history — existing mortality-by-decade analytics annotated with a
  static table of epidemics and wars ("five deaths in 1832 — cholera years")
- **Expected-census coverage** (inference): for each person, which US censuses they should
  appear in given their lifespan and residence; compared against census-titled sources
- **Military service windows** (inference): men of service age during each conflict,
  compared against military-titled sources; pairs naturally with NARA record matching

**Tier B — Machine-flagged, human-confirmed (~8 checks).** The app raises suspicions; only
the user can close them. Design a review-queue idiom: flag → user examines → confirms fine
or marks a problem (their ruling persists and silences the flag).
- Same-name confusion risk (two people, same name, same era, same region)
- Probable spelling-variant and nickname duplicates (edit distance + a Polly/Mary-style
  nickname dictionary)
- Citation quality grading — an AI batch job grades each source/citation string for
  locatability ("family records" fails; volume/page/roll citations pass) and classifies
  primary vs. derivative; grades are cached per source, refreshed only when sources change
- Burned counties / boundary changes — static reference tables flag tree counties with
  known record loss or boundary shifts affecting search strategy

**Tier C — Attestation only (~8 checks).** No data can answer these; the user attests.
Pass/caution/fail plus a note, persisted per tree, editable forever. Design this as the
minority of the experience — a considered "researcher's declarations" section, not the
main event. Notes should feel connected to the existing research-briefs feature.
- Informant reliability considered; conflicting evidence documented and resolved; negative
  searches recorded; alternative parentage hypotheses weighed; land/probate and church
  record coverage

**Tier D — Excluded, honestly (~7 checks).** Call these out in the design as "not part of
Tree Health" rather than silently omitting:
- All four DNA questions — Witness holds no DNA data. Either omit the category or present
  it as a pure attestation section clearly labeled as outside the app's data.
- Census age-agreement across enumerations — requires per-census extracted ages Witness
  doesn't have.
- Immigration/naturalization and probate/land date-ordering — the importer currently keeps
  only birth, death, burial, and residence events; these event types aren't stored. (A
  future import extension could add them; don't design UI that depends on it now.)

## The score

- Weighted like the reference (pass = 1, caution = ½, fail = 0), but **split by kind**: a
  computed score (Tier A, always available, recomputed after each import) and an attested
  score (Tiers B/C, grows as the user works). Show them honestly — "92% computed · 14 of 16
  reviews answered" — never blend them into one number that hides how much is unrated.
- Verdicts in editorial voice ("Strong — well-sourced and internally consistent"), in the
  broadsheet register. This is a newspaper's assessment, not a fitness-app ring.

## Placement & performance

- The audit is **computed and cached per tree** — recomputed on import and on explicit
  "re-run", never live per-render. Cheap to read, visible timestamp ("audited after your
  July 22 import").
- One home screen in the deck can carry the Tree Health verdict + the top 3 open flags;
  the full scorecard is its own screen, deep-linked from there. Respect the home-screen
  budget from the companion brief.
- Platform carriers as before: swipeable page (iPhone/iPad), broadsheet carousel panel +
  drawer detail (web ≥900px).

## Appendix: the FTAnalyzer check catalog

FTAnalyzer (ShammyLevva/FTAnalyzer, Apache 2.0) is the genealogy community's most
respected free GEDCOM auditor; its data-error catalog is the field-tested reference for
Tier A. We are adopting it with attribution. Design against the full list — grouped here
by what Witness can do with each check.

**Computable in Witness today (23):**
1. Birth after death/burial
2. Birth after father aged 90+
3. Birth after mother aged 60+
4. Birth after mother's death
5. Birth more than 9 months after father's death
6. Birth before father aged 13
7. Birth before mother aged 13
8. Burial/cremation before death
9. Implausibly old at death
10. Facts dated before birth (sweep across all stored events)
11. Facts dated after death
12. Marriage after own death
13. Marriage after spouse's death
14. Marriage before aged 13
15. Marriage before spouse aged 13
16. Flagged as living but has a death date
17. Duplicate fact (identical event recorded twice)
18. Possible duplicate fact (near-identical events)
19. Husband recorded female / wife recorded male
20. Couples with the same birth surname (already exists as `sameSurnameMarriages`)
21. Child born too soon after a sibling (caution severity)
22. Child born impossibly soon after a sibling (fail severity)
23. Any date in the future

**Needs a small importer extension first (4):** birth after baptism/christening (baptism
events aren't stored yet); residence-vs-census-date warnings and census date-range checks
(need census-reference parsing from citations — planned); unknown/custom fact type
surfacing (an import report listing GEDCOM facts Witness dropped — immigration,
naturalization, probate — which doubles as the roadmap for storing them).

**Not applicable to Witness (5):** the two Lost Cousins website-tag checks, the UK 1939
Register birthdate check, GEDCOM children-status tally mismatch (fields not stored), and
FTAnalyzer's internal "uncategorised error" bucket.

Design note: the 23 computable checks are the expanded Tier A. They fold into the same
category structure as the main brief (biological plausibility, logical consistency,
identity, coverage); do not present them as a flat 23-row list.

## What to deliver

- The Tree Health screen(s): category structure, how computed verdicts / review queue /
  attestations are visually distinguished, the split score treatment, and empty states
  (a fresh 12-person tree and a never-attested tree both need dignity)
- The home-screen tile version (verdict + top flags)
- The review-queue interaction (flag → examine → rule) and where the ruling lives
- Per element: which tier it belongs to, exact data named from the tiers above, and
  tap-through destinations (ancestor page, sources, research briefs, map)
