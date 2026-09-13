# WWII Army enlistments — the `aad-wwii-enlistment` register

**Variant C, deep-link + save-back, config only.** No `records.csv`: the
source is 8.7 million rows in the National Archives' Access to Archival
Databases (AAD), which has no API, no export, and blocks non-browser
clients. Exposure is the candidate (`match-records` / `match-registers`
write one link per exposed person, the Variant B shape); the card opens
the prefilled AAD search in the in-app browser; "I found them" opens the
save-back form (`config.saveBack`, rendered by `registers/saveBack.ts`)
and the saved fields become the record on the Portrait, a `military`
event with the enlistment year, and a provenance-labelled block in
"Their World".

## Source

- **Electronic Army Serial Number Merged File, ca. 1938–1946 (Enlistment
  Records)**, in the series World War II Army Enlistment Records, RG 64,
  National Archives Catalog NAID 604357. AAD series `dt=893`:
  https://aad.archives.gov/aad/fielded-search.jsp?dt=893&tf=F&cat=all&bc=sl
- US government work, public domain. ~8.7M of the ~9M cards survive;
  Army and Army Air Forces only (no Navy, Marines, Coast Guard); few
  officers.
- Fields on the record: serial number, name, residence state and county,
  place of enlistment, date of enlistment, grade, branch, term, nativity,
  year of birth (two digits), race, education, civilian occupation,
  marital status, component, source of personnel.

## The deep link (verified 2026-09-13)

`display-partial-records.jsp` with the form's hidden descriptors and the
name as `SURNAME#GIVEN` — the `#` is how the file separates name parts —
plus a two-digit birth year:

```
…&txt_24995={surname_upper}%23{given_upper}&txt_24983={birth_yy}…
```

`HOWE#CHARLES` + `26` returned two records in a browser session;
lower-case works too. The first response is a "Searching… please wait"
interstitial that reloads itself — the in-app browser handles it. The
site answers 403 to non-browser user agents, so Witness never fetches it.

## Exposure

Born 1893–1929 (+2), a United States event 1930–1950 (+1), a US place
(+1), coincidence (+1); citations of the enlistment file (+4), any WWII
record (+2), a WWII draft card (+1). Threshold 4. Living people are never
candidates.

## Widening

- The raw data file is downloadable through the Catalog (search within
  NAID 604357); at ~9M rows it is the server-side, worker-fed shape
  `va-burials` proved, and would turn this from a deep link into offered
  candidates. Deferred until the worker-fed pattern has run a while.
