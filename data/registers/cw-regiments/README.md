# Civil War regiments register (Variant B, Union)

**What the rows are.** 1,593 Union units parsed from Frederick H. Dyer's
*A Compendium of the War of the Rebellion* (1908, public domain) — entity
records keyed on the `US-{STATE}-{BRANCH}-{NUMBER}` scheme, each carrying
its organized/mustered-out facts and a verbatim excerpt of Dyer's service
narrative. Not ingested, ever: the 6.3M-name CWSS soldier index, state
rosters, or any commercial dataset (decision 1 of
docs/witness-civil-war-prompt.md).

**Parser state (honest).** `scripts/parse-dyer.ts` off the Google-scan
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

**Not built yet** (next Civil War session): the Add-unit entity picker,
NPS battle summaries + Confederate units, engagement geocoding + map
markers, a generated narrative sample for a soldier with a unit.
