# Competitive analysis — TreeLab (treelab.jernealogy.com)

**Date:** 2026-08-05
**Method:** Read the shipped production bundle — `index-CCWWeewU.js` plus all 46
lazy-loaded route chunks — and extracted view names, control labels, help text,
FAQ, privacy policy and terms. The feature list below is derived from code that
is actually deployed, not from marketing copy.
**Not verified:** No GEDCOM was run through it. Nothing here speaks to how well
any of it works, only to what exists.

---

## 1. What it is

A free, client-side browser SPA built by **Jeremy Lehmann** (Jernealogy — a
YouTube channel covering Y-DNA, Jewish genealogy and research technique).
TreeLab is listed on jernealogy.com as one of four audience destinations
alongside About / YouTube / Y-DNA. It is a channel asset, not a company.

**Architecture and business model**

- React SPA on Cloudflare. GEDCOM is parsed in-browser via the File API and
  never uploaded.
- Optional free accounts on Supabase Auth. Signed-in users may save **up to 3
  trees** — stored as a *parsed representation*, not the original `.ged`.
- **No monetization of any kind.** Zero pricing, tier, paywall, upgrade or
  subscription strings across ~400 KB of application bundle.
- Terms reserve the right to discontinue cloud storage; liability is capped at
  "the amount you paid us… which for free users is zero."
- Privacy policy states saved trees are **"not end-to-end (zero-knowledge)
  encrypted."** They say so plainly, to their credit.

**Audience tilt.** The depth is unmistakably Ashkenazi: Hebrew-calendar
yahrzeits with Adar I/II handling, Yiddish *kinnui* matching in the duplicate
detector, a given-name dictionary keyed to Beider, Galicia / Congress Poland /
Grand Duchy of Posen place normalization, and Austro-Hungarian *Spezialkarte*
map mosaics. Excellent for their channel audience; not a general-market product.

---

## 2. Feature inventory

### Overview / Dashboard
Total people, surnames, generations, average lifespan, earliest year · **Tree
Health Score** (composite; deceased profiles excluded) · top surnames · top
birth locations · family-size distribution · longest parent-to-child chain as
generation depth · next family date · coming up this week.

### People & relationships
- Person Stats — ancestor/descendant counts, fan chart, surrounding family
- **Life Journey** — chronological timeline: births, marriages, children,
  migrations, occupations, deaths of those close
- Cousins — 1st–3rd including half cousins, same-generation only, each labeled
  with the shared ancestor
- Ancestor lifespans by generation, with an overlapping timeline
- **Relationship Finder** — blood path first, falls back to in-law/step paths
  bridged through spouses
- **Compare People** and **Compare Trees** — side-by-side family context with
  name matches highlighted; built specifically for duplicate adjudication
- Expected shared-cM ranges via Shared cM Project 4.0 / DNA Painter v4

### Charts
Fan chart · ancestor tree · descendant tree · descendant fan · descendants-by-
generation · **bow-tie** · indented descendant register with d'Aboville
numbering · **ancestral origins** by modern country *and* historical
jurisdiction-at-time-of-birth, with a composition-over-time view.

### Maps — their heaviest investment
- Ancestor birthplace map, filterable by generation and 50-year birth period
- Surname map, plus surname labels drawn directly on the map
- Descendants map
- **Migration Map** — immigrant ancestors traced to a destination country,
  filtered by origin, generation, decade, paternal/maternal side, grandparent
  branch, evidence quality, and direct vs multi-stop; play-through arrival
  timeline; detects border changes ("same locality, the country changed")
- **Where & When** — place + radius + year range returns everyone present,
  including *likely presence inferred from close relatives' records*, always
  labeled and never substituted for a record
- Census / residence maps with period-correct US county boundaries (Newberry
  Atlas of Historical County Boundaries), playable by census year
- **The Map Room** — hundreds of georeferenced public-domain historical maps
  (David Rumsey, Biblioteka Narodowa, Wikimedia, USGS/LOC), auto-matched to a
  person by place *and* year; overlay + swipe comparison, opacity slider,
  gallery / timeline / 3D-globe browsing, era stacks, editor's picks, favorites
- **Who Lived Next Door** — street-level address resolution with pin
  correction, ADDR-field detection, census-subdivision rejection heuristics
  (Ward/District/ED), ZIP false-positive detection, co-resident propagation

### Research
- Duplicate detector — name similarity + overlapping birth years, with Yiddish
  kinnui and shared-Hebrew-root matching
- Brick walls — oldest known ancestor per line, watchable
- Research Gaps — coverage gauge, prioritized targets, filterable to a single
  person's ancestor set
- Data integrity — death before birth, parent born after child, mother <12 or
  >60, father <12 or >80, lifespan >120, marriage before birth, missing gender,
  unconnected individuals, disconnected sub-trees
- **Naming Patterns** — memorial naming after grandparents and
  great-grandparents, necronym reuse after an early death, first-son→paternal-
  grandfather and four other positional traditions, the Jr. pattern, and
  experimental unmarked Jewish patronymics; each expressed as a percentage of
  eligible families
- Pedigree collapse — repeat ancestors, cousin marriages, generation offsets
- **DNA Planner** — ranks the best living testers per line; flags Y-DNA
  patrilines and mtDNA matrilines approaching untestable as candidates die out
- **My Research** — a hub where every decision accumulates: dismissals,
  verifications, tags, notes, a Fix List, and a research log
- **Tree Pulse** — re-upload a newer GEDCOM, diff against the saved copy,
  report what the research session changed; confirms Fix List items as applied

### Names
Every surname with counts · per-family "naming fingerprint" (names used far
more than the rest of the tree) · namesake inference · death-year prediction
from name resurfacing across branches · Hebrew / Yiddish / secular given-name
dictionary.

### Calendar
Today and month views · birthdays, wedding and death anniversaries · arrival,
emigration and naturalization anniversaries · **Hebrew-calendar yahrzeits with
Adar I/II observance options** · per-person inclusion overrides · milestone-only
mode · `.ics` export with reminders and a living-people privacy gate.

### Export
Ahnentafel (10 generations) · descendant report · family group sheet ·
individual summary — all print/PDF · PNG export of charts and maps in Clean /
Presentation / Publication styles · Excel/CSV on every findings table ·
shareable stats card.

### Platform
Home person · privacy mode (masks anyone born after 1930 with no death date) ·
dark mode · dyslexia-friendly font · per-section guided tours · intro video ·
user guide · in-app feedback with screenshot capture.

---

## 3. Overlap map

| Capability | TreeLab | Witness |
|---|---|---|
| GEDCOM import, read-only | ✅ | ✅ |
| Data-integrity checks | ✅ deeper, exportable, filterable by line | ✅ 22 FTAnalyzer rules |
| Tree health score | ✅ | ✅ |
| Duplicates / brick walls / gaps | ✅ | partial |
| Relationship calculation | ✅ incl. in-law paths | ✅ |
| Map of recorded places | ✅ far deeper | ✅ |
| Charts (fan, bow-tie, descendant) | ✅ | ❌ (Family Stage is a different form) |
| Historical map overlays | ✅ shipped | ❌ |
| Printable reports (Ahnentafel etc.) | ✅ | ❌ |
| DNA test planning | ✅ | ❌ |
| Naming patterns / pedigree collapse | ✅ | ❌ |
| Calendar export | ✅ | partial (This Week) |
| GEDCOM refresh / diff | ✅ **Tree Pulse, shipped** | ❌ **on the Coming list** |
| **AI biographies** | ❌ | ✅ |
| **Historical record matching (NARA)** | ❌ | ✅ |
| **Narrative / historical context** | ❌ | ✅ |
| **Query library (39 questions, 48 events)** | ❌ | ✅ |
| **Research Brief** | ❌ | ✅ |
| **Location-aware Nearby** | ❌ desktop-only by design | ✅ |
| **Native mobile app** | ❌ | ✅ |
| **Zero-knowledge vault for the original file** | ❌ explicitly not | ✅ |
| Orphan records | ✅ (unconnected people) | ✅ |

---

## 4. Assessment

**It is a better analysis tool than Witness on the analysis axis, and it is
free.** On charts, maps, printable reports and gap-finding it is not close. The
Map Room in particular — georeferenced historical sheets matched to a person by
place *and* year, with overlay and swipe — is a genuine asset library
representing months of curation work, and it lands in adjacent emotional
territory to Family Street View while being shipped today.

**But it is not a competitor. It is a different product that shares an input
format.**

- **Desktop-only, stated in their own FAQ** — phones "may feel cramped."
  Witness's best features (Nearby, daily surfacing, This Week) only make sense
  on a device you carry.
- **No storytelling at all.** No biographies, no historical context, no
  narrative. That is the entire Witness thesis and they have not touched it.
- **No record matching.** TreeLab tells you a gap exists; Witness goes to NARA
  and proposes a document to fill it. Diagnosis vs retrieval.
- **Weaker privacy posture**, and stated as such. The Witness vault is a real
  differentiator, not marketing.
- **Not a business.** Free, single maintainer, cloud storage disclaimed in the
  terms. Good for reach, bad for a serious researcher's five-year confidence.

### What should actually change

1. **Tree Health has been commoditized.** The 22 FTAnalyzer checks are now a
   free web feature with spreadsheet export and per-line filtering. Keep the
   feature; demote the pitch. It should not be the first substantive section of
   the website.
2. **They shipped GEDCOM Refresh and we haven't.** "Tree Pulse" is our Coming-
   list item, done — with a better frame: it reports *what your research session
   accomplished* rather than *how to avoid a duplicate tree*. Reward loop, not
   migration chore. Steal the framing; prioritize the feature. "Each upload
   creates a new tree" is currently our roughest shipped edge.
3. **Findings should be exportable and should accumulate.** Every TreeLab
   findings table has an Excel button, and every decision lands in a persistent
   research hub with a log. Cheap to build; it is what makes a tool feel like it
   respects a serious researcher's workflow.

### What not to do

Do not chase fan charts, printable Ahnentafels, or a historical map room. That
is a year of work to draw level on the axis where they are strongest and we are
not differentiated — funded by a subscription they do not need to charge.

### Strategic read

Someone with a genealogy audience independently built the analysis layer and
gave it away. That is evidence the demand is real and that the *diagnostic* half
of this category is now free. The half nobody has built is the one Witness is
building: making a person care about the names. The thesis is intact; the
positioning needs to say so sooner.

---

## 5. Watch list

- Whether Jeremy monetizes TreeLab, or it stays a channel asset
- Whether the Map Room adds a "walk the street" or immersive mode
- Whether any AI/narrative feature appears (currently zero surface area)
- Map Room coverage waves — they solicit region requests via feedback
- Whether a mobile-responsive pass lands (currently disclaimed)
