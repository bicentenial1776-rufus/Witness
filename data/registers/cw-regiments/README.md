# Civil War regiments register (Variant B, Union)

**What the rows are.** 1,593 Union units parsed from Frederick H. Dyer's
*A Compendium of the War of the Rebellion* (1908, public domain) — entity
records keyed on the `US-{STATE}-{BRANCH}-{NUMBER}` scheme, each carrying
its organized/mustered-out facts and a verbatim excerpt of Dyer's service
narrative. Not ingested, ever: the 6.3M-name CWSS soldier index, state
rosters, or any commercial dataset (decision 1 of
docs/witness-civil-war-prompt.md).

**2026-09-06 pass.** OCR repair on the narratives (years inside the war's
decade, unambiguous month misreads, shredded branch words) took the odd
year tokens from 2,720 to 147 and the unknown-branch units from 87 to 61;
26 garbled duplicates ("5th Iowa Cavatjay") retired into their real units,
1,578 now. "Org. at" is read as organized. Variant B candidates now flow:
exposure IS the candidate (one link per exposed man, no record), boosted
by a citation signal — a source the tree itself cites whose title says
"Civil War" — and confirmed by attaching the regiment in the app's picker
(confirmEvent writes a military event "Served in the …"). Engagement
events are still the 17-row sample: the extractor over all units yields
541 rows of which too many read "Captured" — its own pass, still.

**Parser state (honest, 2026-09-02).** `scripts/parse-dyer.ts` off the Google-scan
OCR: 1,593 unique units from 2,235 heading hits, 47 headings unparsed
(shredded-caps sample kept in the parser run log). Dyer names ~3,500
units — the gap is Part-3 sections whose headings the OCR shredded past
repair plus batteries/battalions under formats not yet handled; both are
parser widenings. Engagement-event extraction is DELIBERATELY thin (17
events across a 20-unit sample): the date-tail heuristic under-captures
and needs its own pass before events feed the map. Unit histories are
verbatim and safe regardless.

**parseUnitDesignation** (`registers/normalizers/unitDesignation.ts` +
versioned `unit-terms.json`): 52-string gauntlet at 100%, ≥80% gate in
CI. NOTE: the Howe/Field GEDCOM carries NO Civil War unit strings (its
military events are 1917 draft registrations), so `parsed_from_gedcom`
has no live input on this tree — the path is built for trees that do.

**Deep links.** CWSS has NO parameterized search (verified — form-driven
app), so the register's door is the FamilySearch Civil War Soldiers Index
(the NPS-derived index) prefilled on the verified `q.*` scheme, with the
CWSS page linked from unit records. Collection id 1910717 to be
eye-verified in a browser during E2E, per the framework rule.

**Unit hints (2026-09-06).** Witness holds no name index and never
guesses a regiment; but the family's own file often names it. The
candidate card runs `findUnitMentions` (`registers/unitHints.ts`) over
the readings of the person's media — a headstone "Co. H 25th Mass.
Vols.", an obituary clipping — hands each span to the unit parser, and
matches the key against these rows (a branchless key matches every
branch of that state and number). The card shows the words it came from
and offers "Attach the …". The picker's first shelf is the state he
lived in during 1855–1870 (`warStateFromPlaces`). `config.unitTerms` is
merged from `unit-terms.json` by seed-register so the app parses with
the same vocabulary.

**Engagements from the NPS, placed (2026-09-13).** `events.csv` is no
longer the 17-row Dyer-OCR sample: `scripts/parse-cwss-battles.ts` reads
the National Park Service's CWSS unit and battle tables (the 2011
civilwar150th OData feeds, US government work, mirrored in the public
bucket `s3://jrnold-nps-cwss/old/` — battle.xml, battleunitlink.xml,
units.xml; the 6.3M-name soldier index is untouched), parses each CWSS
Union unit name through the register's own parser to its
`US-{STATE}-{BRANCH}-{NUMBER}` key, and joins it to Dyer's rows: 3,207
Union units in CWSS, 2,078 parsed, 1,423 joined to the 1,578 Dyer
records. The 17,887 battle–unit links (NPS's own, sourced from Dyer)
become **10,069 engagement events across 955 units**, each with the
CWSAC battlefield code in `linked_event_ref`, the battle's dates, type
and state in `place_text`, and coordinates for 9,901 of them: 336 of the
382 CWSAC battles placed from Wikidata (battles of the American Civil
War with P625), 31 more from OpenStreetMap on "name, state" with the
answer required to sit in the battle's own state, 15 unplaced (forts,
farms, and creeks no gazetteer names). `battles.csv` is the reference
list with the NPS short summaries; `battles-coords.json` caches every
coordinate with its source so re-runs are free. Re-seed with
`seed-register.ts` — events replace wholesale.

**Where the events go.** A confirmed regiment's placed engagements reach
the Ancestor Map as ink-ringed markers ("His regiment was here", never
the amber of a person's own record — `lib/register-points.ts`), and the
"Their World" prompt as a UNIT-LEVEL block that tells the writer to say
"his regiment", not "he".

**Not built yet** (next Civil War session): Confederate units (CWSS
names 3,737 of them, but Dyer has no rows to hang them on — a
Confederate entity table is the prerequisite), a generated narrative
sample for a soldier with a unit, and a state-scale cluster for the
engagement markers.
