# Immigrant ship passenger lists

Transcribed passenger lists for voyages from England and Europe to the
American colonies, and the machinery for asking whether anyone in a tree
sailed on one.

**No passenger facts are authored here.** Every row carries the
transcription it came from. A name in `passengers.json` is a claim made
by a published source, and a match against the tree is a question for a
researcher, never a finding.

## Files

- `voyages.json` — voyage metadata only: ship, year, ports. Facts about
  the sailing, not about anybody aboard. Add a voyage here before
  importing its list.
- `passengers.json` — the imported lists. Created by the importer; not
  hand-edited.

## Where the lists come from

None of these are bundled — they carry their own licences and some are
transcriptions someone else did the work on. Pull what you need, save it
as CSV, and import.

| Voyage | Source | Notes |
|---|---|---|
| Mayflower, 1620 | [List of Mayflower passengers](https://en.wikipedia.org/wiki/List_of_Mayflower_passengers) (CC BY-SA) | All ~102, with birth and death years where known. Companion pages list [those who died at sea](https://en.wikipedia.org/wiki/List_of_Mayflower_passengers_who_died_at_sea_November/December_1620) and [in the first winter](https://en.wikipedia.org/wiki/List_of_Mayflower_passengers_who_died_in_the_winter_of_1620%E2%80%9321). |
| ~90 ships, 1620–1640 | Banks, *Planters of the Commonwealth* (1930, PD) — [archive.org](https://archive.org/details/plantersofcommon00bank) | Parsed by `packages/core/scripts/parse-banks.ts` from the OCR text. Names are reliable; the flattened columns mean origins ride in notes only when they shared the name's line. No birth/death years — matches lean on name + alive-window. |
| ~35 ships, 1634–1635 | Hotten, *The Original Lists of Persons of Quality* (1874, PD) — raw OCR committed at repo root as `hotten.txt` | Parsed by `packages/core/scripts/parse-hotten.ts` from the London port register certificates. Ages as sworn at embarkation become derived birth years (`c. 1608`). Ships also in Banks were merged into one voyage, per-row sources kept. |
| Ark and Dove, 1634 | Maryland land patents (Skordas 1968; Gibb 1997) as compiled in Newman, *The Flowering of the Maryland Palatinate* (1968) | **No manifest survives** — presence aboard is inferred from patent claims, never recorded. The voyage notes say so. |
| Mayflower, 1620 | [General Society of Mayflower Descendants](https://themayflowersociety.org/passenger-profiles/) | Passenger profiles — the authority, but not bulk-downloadable. |
| Mayflower, 1620 | [Massachusetts Society of Mayflower Descendants](https://massmayflower.org/mayflower-passengers/) | Parentage, birth, death, marriages per passenger. |
| Mayflower, 1620 | [FamilySearch](https://www.familysearch.org/en/blog/mayflower-passenger-list) | By surname, with age at departure. |
| Winthrop Fleet, 1630 | [Wikipedia: Winthrop Fleet](https://en.wikipedia.org/wiki/Winthrop_Fleet); [WikiTree](https://www.wikitree.com/wiki/Space:Winthrop_Fleet); [packrat-pro](https://packrat-pro.com/ships/winthrop.htm) | Banks (1930) is the classic list; Robert Charles Anderson's *The Winthrop Fleet* (2012) supersedes it and is the one to trust where they differ. |
| Philadelphia arrivals, 1727–1808 | [Pennsylvania German Pioneers, Strassburger & Hinke — Internet Archive](https://archive.org/details/pennsylvaniagerm43stra) | Public domain. ~30,000 heads of German-speaking families, 1727–1775. Ship-by-ship oath lists; heads of household only, and mostly without dates. |
| Palatine ships | [Palatine Ships Passenger Lists (RootsWeb)](https://freepages.rootsweb.com/~pagermanshipslists/genealogy/) | Transcriptions by ship and year. |
| Research guide | [germanroots.com](https://www.germanroots.com/penngermans.html) | How the Pennsylvania German lists are organized. |

Two things worth knowing before trusting any of them: the German lists
name heads of household and rarely give dates, so matching on them leans
almost entirely on name plus era; and the Mayflower literature carries
two centuries of disproved descents, so a name matching a Mayflower
passenger is the *beginning* of a question.

## Importing a list

Save the transcription as CSV with a header row. Recognized columns, in
any order and any case:

```
name | full_name | passenger      # split on the last space if given/surname absent
given | given_names | first_name | forename
surname | last_name | family_name
birth | birth_year | born         # "c. 1584", "abt 1584", "1584?" all read as 1584
death | death_year | died
age                               # for lists that give ages, not dates
notes
source                            # per-row provenance; falls back to the voyage's
```

Then:

```bash
cd packages/core
npx tsx scripts/import-passenger-list.ts ~/mayflower.csv mayflower-1620
```

Re-importing a voyage replaces its rows rather than doubling them.

## Comparing against a tree

```bash
# From a GEDCOM — no credentials needed
npx tsx scripts/match-passengers.ts --gedcom "fixtures/Howe_Field Family Tree.ged"

# From the live tree — needs .env, like the other live scripts
npx tsx scripts/match-passengers.ts --tree <treeId> --min probable --csv candidates.csv

# Same, but also persist candidates for the Portrait's Crossing card
npx tsx scripts/match-passengers.ts --tree <treeId> --min probable --write
```

`--write` upserts into `passenger_candidates` (see
`supabase/migrations/20260830090000_passenger_candidates.sql`) as the
signed-in tree owner. Re-running is safe: a candidate someone has already
confirmed or dismissed on the Portrait is left alone; only pending rows
get refreshed. There is no worker running this on a schedule yet (unlike
`nara-enrich`) — matching is fast and deterministic, so a manual re-run
after every import is enough for now.

### How a match is decided

Surnames are bucketed by soundex, so Howe, How and Howes land together;
given names must also match by sound. Then the years have to be possible:

- **strong** — name matches exactly and a birth or death year agrees
  within five years.
- **probable** — the years agree but the spelling drifted, or the name is
  exact and the person was demonstrably alive when the ship arrived.
- **weak** — the name matches and nothing contradicts it. On a common
  name this means very little; `--min probable` hides these.

A pair is dropped outright when birth or death years are more than
fifteen years apart, when the person was born after the ship arrived, or
when they were already dead. Every candidate carries its reasons in
plain words, because the reasons are the useful part.

Then a second pass for households. A list writes a wife under her
husband's surname; a tree writes her under her maiden name, or as plain
"Sarah" with no surname at all, and no surname bucket brings those rows
together. So every candidate at probable or better anchors a look at
their spouses on the same voyage: the anchor passenger's surname, a
given name that sounds alike, and the same year tests. The result is
capped at **probable** (the anchor is evidence of the household, not of
the person) and its reasons say so in plain words. Only spouses not
recorded as male are read this way, since the lists of this era never
write a man under his wife's name, and anyone the name pass already
placed on the voyage is left as found.

The matcher reports every candidate rather than picking a winner. Two
men named John Cooke born within a decade of each other is a question,
and the answer lives in the record.
