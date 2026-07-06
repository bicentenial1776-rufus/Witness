# Witness — Query Library
**Date:** July 2026  
**Schema version:** Post Phase 1+2 (parser + Supabase schema live, geocoding not yet run)  
**Contents:** Implementation architecture (the three surfaces), then the master library — 371 queries across 15 sections (329 distinct after cross-section duplicates), each with a buildability flag.

---

## Implementation Architecture — The Three Surfaces

The library below is a catalog of what Witness can answer, not a menu the user browses. **Nowhere in the product does a user scroll a complete list of events or queries.** If a design produces a browsable "all events" catalog, the design is wrong. Every query reaches the user through one of three surfaces, and the surfaces feed each other.

### The substrate: `historical_events`

A curated, server-side events table powers the temporal surfaces. Each event carries:

| Column | Purpose |
|---|---|
| `start_year`, `end_year` | Inclusive range for the lifespan-overlap rule: `birth_year ≤ event_end AND (death_year IS NULL OR death_year ≥ event_start)` |
| `tier` | `major` \| `regional` \| `local` — how wide the event's reach was, and how it ranks |
| `geo_scope` | Nullable jsonb — the bounding regions or place names the event touched; null means everywhere |
| `context_line` | One accurate sentence framing the event (stored as `summary` in the live schema) |
| `lens_affinity` | Nullable text[] — heritage branches the event speaks to (e.g. `['acadian']`) |

Seeded from the ~44 🟢 NOW events in Section I. New events ship server-side without an app update.

### Surface 1 — "Lived Through" tags on ancestor cards

Every ancestor card carries up to **5** tappable event tags: the events whose years overlap the ancestor's lifespan, ranked by tier (major first) with a boost for events whose `geo_scope` matches the places in that ancestor's record. Tapping a tag runs the event query and lands on the results screen **with that ancestor pinned at the top**. The tags let a user see the era before reading a word — and they are the loop back into results.

### Surface 2 — The Curated Shelf

Explore leads with a shelf of **3–5** event cards chosen for *this tree, this month* by a scoring function:

- **Result density** — how many ancestors in the tree were alive during the event
- **Geographic match** — event `geo_scope` against the tree's place concentrations
- **Lens affinity** — event `lens_affinity` against heritage branches detected in the tree
- **Anniversary proximity** — start/end year hitting a 25/50/100-year multiple of the current year earns a boost and an "X years ago" label

Regional and local events must earn their place through geographic or lens relevance; major events qualify on density alone. The shelf is cached per tree and recomputed on re-import and monthly.

### Surface 3 — Search and situation queries

The general search field (people and history, on demand) and the situation categories (where your family lived, migration paths, kindred couples, "I'm here") remain their own Explore entries. Search surfaces events only when the user asks; it is not a browsing mode.

### The flywheel

**Shelf → results → ancestor card → tags → results.** The shelf opens a query; the results screen leads to an ancestor; the ancestor's tags open the next query. Every surface exits into another surface. Nothing dead-ends, and nothing is exhaustively listable.

**Read-only always:** none of this writes to GEDCOM data. The events table and any shelf caches are Witness's own layers on top.

---

# The Library — Query Buildability Audit
---

## Flag Legend

| Flag | Meaning | Action |
|---|---|---|
| 🟢 **NOW** | Buildable today against current schema | Build in Phase 2 query engine |
| 🟡 **GEOCODE** | Needs lat/lng populated — one pipeline run away | Build after geocoding pipeline runs |
| 🔵 **API** | Needs a specific external API integration | Build in Phase 3+ per API |
| 🟠 **GEDCOM-SPARSE** | Query is valid but most GEDCOMs (including yours) rarely have this field populated | Build the query, surface gracefully when data absent |
| 🔴 **V3** | Requires cousin discovery network — other users' trees | Phase 4+ |
| ⚫ **AI** | Requires Claude Sonnet inference, not just data query | Phase 3 AI enrichment layer |

---

## I. Temporal — Historical Event Overlap

*All of these follow the same pattern: birth_year ≤ event_end AND (death_year IS NULL OR death_year ≥ event_start). All are buildable NOW against your schema with a curated event date library.*

| Query | Flag | Notes |
|---|---|---|
| Who was alive during the Mayflower voyage (1620)? | 🟢 NOW | |
| Who lived through the founding of Rhode Island (1636)? | 🟢 NOW | |
| Who was alive during King Philip's War (1675–1678)? | 🟢 NOW | Already validated — 1,046 results |
| Who lived through the Salem Witch Trials (1692)? | 🟢 NOW | |
| Who was alive during the Great Awakening (1730s–1740s)? | 🟢 NOW | |
| Who lived through the French and Indian War (1754–1763)? | 🟢 NOW | |
| Who was alive when the Stamp Act was passed (1765)? | 🟢 NOW | |
| Who was alive during the Boston Massacre (1770)? | 🟢 NOW | |
| Who was alive when the Declaration was signed (1776)? | 🟢 NOW | |
| Who served or was of fighting age during the Revolution (1775–1783)? | 🟢 NOW | Age filter: birth_year between 1740–1763 |
| Who lived through the Constitutional Convention (1787)? | 🟢 NOW | |
| Who was alive when Washington died (1799)? | 🟢 NOW | |
| Who was alive during the Louisiana Purchase (1803)? | 🟢 NOW | |
| Who lived through the War of 1812? | 🟢 NOW | |
| Who was alive during the Erie Canal construction (1817–1825)? | 🟢 NOW | |
| Who lived through the Trail of Tears (1838)? | 🟢 NOW | |
| Who was alive during the Mexican-American War (1846–1848)? | 🟢 NOW | |
| Who lived through the California Gold Rush (1848–1855)? | 🟢 NOW | |
| Who was alive when the transcontinental railroad completed (1869)? | 🟢 NOW | |
| Who was alive during the Great Famine in Ireland (1845–1852)? | 🟢 NOW | Even richer with geocoding — filter by Irish-origin places |
| Who emigrated during peak Irish immigration (1845–1860)? | 🟠 GEDCOM-SPARSE | Needs emigration event data — rarely structured in GEDCOMs |
| Who emigrated during peak French Canadian immigration (1865–1900)? | 🟠 GEDCOM-SPARSE | Same — emigration events sparse |
| Who was alive during the Gilded Age (1870–1900)? | 🟢 NOW | |
| Who lived through the Panic of 1873? | 🟢 NOW | |
| Who lived through the Panic of 1893? | 🟢 NOW | |
| Who was alive when Ellis Island opened (1892)? | 🟢 NOW | |
| Who was alive during the Klondike Gold Rush (1896–1899)? | 🟢 NOW | |
| Who was alive when the Wright Brothers flew (1903)? | 🟢 NOW | |
| Who was alive during the San Francisco earthquake (1906)? | 🟢 NOW | Richer with geocoding — filter California residents |
| Who lived through World War I (1914–1918)? | 🟢 NOW | |
| Who was of fighting age during WWI? | 🟢 NOW | birth_year 1880–1900, male |
| Who survived the 1918 influenza pandemic? | 🟢 NOW | Alive during 1918, survived past 1919 |
| Who was alive during Prohibition (1920–1933)? | 🟢 NOW | |
| Who lived through the Great Depression (1929–1939)? | 🟢 NOW | |
| Who was alive during the Dust Bowl (1930–1936)? | 🟢 NOW | Richer with geocoding — Plains states filter |
| Who lived through World War II (1939–1945)? | 🟢 NOW | |
| Who was of fighting age during WWII? | 🟢 NOW | birth_year 1910–1927, male |
| Who was alive when the atomic bomb was dropped (1945)? | 🟢 NOW | |
| Who lived through the Korean War (1950–1953)? | 🟢 NOW | |
| Who was alive when JFK was assassinated (1963)? | 🟢 NOW | |
| Who lived through the Vietnam War era (1955–1975)? | 🟢 NOW | |
| Who was alive during the Civil Rights movement (1954–1968)? | 🟢 NOW | |
| Who was alive when the first moon landing occurred (1969)? | 🟢 NOW | |
| Who lived through the AIDS crisis (1980s–1990s)? | 🟢 NOW | |
| Who was alive on September 11, 2001? | 🟢 NOW | |
| Who lived in New England during the Great Hurricane of 1938? | 🟡 GEOCODE | Needs place filter — lat/lng for New England bounding box |
| Who lived in the Dust Bowl states during the 1930s? | 🟡 GEOCODE | Needs place filter |
| Who lived in San Francisco during the 1906 earthquake? | 🟡 GEOCODE | Needs place filter |
| Who lived in Galveston during the 1900 hurricane? | 🟡 GEOCODE | Needs place filter |
| Who lived through the Great Chicago Fire (1871)? | 🟡 GEOCODE | Needs place filter |
| Who lived in New Orleans during major flood periods? | 🟡 GEOCODE | Needs place filter |

**Subtotal: 44 🟢 NOW, 6 🟡 GEOCODE**

---

## II. Temporal — Life Milestones and Patterns

| Query | Flag | Notes |
|---|---|---|
| Who lived the longest in my family? | 🟢 NOW | death_year - birth_year DESC |
| Who died the youngest (excluding infant mortality)? | 🟢 NOW | death_year - birth_year ASC, filter age > 5 |
| Who died in infancy (before age 5)? | 🟢 NOW | death_year - birth_year < 5 |
| What is the average lifespan by century? | 🟢 NOW | GROUP BY century of birth_year |
| What is the average lifespan by surname line? | 🟢 NOW | GROUP BY surname |
| Has average lifespan increased over generations? | 🟢 NOW | Trend line across birth centuries |
| Who in my family reached 90? 100? | 🟢 NOW | Simple age filter |
| Which generation had the shortest average lifespan? | 🟢 NOW | Requires generation depth calc — doable |
| Which decade had the highest mortality in my family? | 🟢 NOW | GROUP BY decade of death_year |
| What was the average age at first marriage by era? | 🟢 NOW | families table marriage_year - individual birth_year |
| What was the average age at first marriage by gender? | 🟢 NOW | Join sex field |
| Who married the youngest? The oldest? | 🟢 NOW | |
| Who was married more than once? | 🟢 NOW | COUNT families_as_spouse > 1 |
| Who had the most children? | 🟢 NOW | COUNT children in families table |
| What was the average number of children per family by century? | 🟢 NOW | GROUP BY century of marriage_year |
| Which families had the most children who survived to adulthood? | 🟢 NOW | Children with death_year - birth_year > 18 or no death_year |
| Who had children late in life (after 45)? | 🟢 NOW | Parent birth_year vs child birth_year |
| Who never married (based on available records)? | 🟢 NOW | No entry in families_as_spouse |
| What is the longest marriage in my family tree? | 🟢 NOW | Needs marriage end — approximated by earlier of death dates |
| Who was widowed and remarried? | 🟢 NOW | Multiple family records + death dates of prior spouses |
| Who was widowed multiple times? | 🟢 NOW | Same pattern, count > 2 |
| In what month were most ancestors born? | 🟠 GEDCOM-SPARSE | Needs full date not just year — many records year-only |
| In what month did most ancestors die? | 🟠 GEDCOM-SPARSE | Same — month data often absent |
| Is there a seasonal pattern to deaths? | 🟠 GEDCOM-SPARSE | Same |
| Are there birth clusters suggesting seasonal conception patterns? | 🟠 GEDCOM-SPARSE | Same |
| How many generations does my tree span? | 🟢 NOW | Recursive family traversal |
| Which surname line goes back the furthest? | 🟢 NOW | MIN birth_year GROUP BY surname |
| Who is my oldest verified ancestor? | 🟢 NOW | MIN birth_year where confidence = 'exact' |
| Who is the most recent ancestor added to the tree? | 🟠 GEDCOM-SPARSE | Needs GEDCOM CHAN tag — parsed but rarely populated |
| How many generations separate me from oldest ancestor? | 🟢 NOW | Recursive depth from root individual |
| Which lines have the most generational depth? | 🟢 NOW | |
| Which lines go cold soonest? | 🟢 NOW | MAX birth_year per terminal ancestor by line |

**Subtotal: 26 🟢 NOW, 5 🟠 GEDCOM-SPARSE**

---

## III. Geographic — Place Discovery

| Query | Flag | Notes |
|---|---|---|
| I'm in this town — who in my family lived here? | 🟢 NOW | place_normalized text match — works without geocoding |
| I'm in this county — who in my family lived here? | 🟢 NOW | Text match on normalized place |
| I'm in this state — who in my family lived here? | 🟢 NOW | Text match |
| I'm in this country — who in my family lived here? | 🟢 NOW | Text match |
| I'm standing in this cemetery — anyone related? | 🔵 API | BillionGraves — needs GPS + API |
| I'm near this church — did my family worship here? | 🟡 GEOCODE | Radius search needs lat/lng |
| I'm near this courthouse — ancestors recorded here? | 🟡 GEOCODE | Radius search needs lat/lng |
| Where did my family originate (earliest known locations)? | 🟢 NOW | MIN birth_year JOIN events place |
| What is the general migration direction over time? | 🟡 GEOCODE | Needs lat/lng to compute directional vectors |
| Did my family move west across America? When? | 🟡 GEOCODE | Longitude shift over time |
| Did my family move from rural to urban? | 🟡 GEOCODE | Needs place classification (rural/urban) |
| Which ancestors crossed the Atlantic? From where? When? | 🟢 NOW | Birth place country ≠ death/resi place country |
| Which ancestors crossed the Pacific? | 🟢 NOW | Same cross-continent logic |
| What was my family doing during the Great Migration? | 🟢 NOW | Temporal + place text match (Southern states) |
| Which ancestors were part of westward expansion? | 🟢 NOW | Birth in East, later resi in West + time period |
| Which ancestors settled in frontier territories? | 🟢 NOW | Place text match on known frontier territories + era |
| What migration corridors did my family follow? | 🟡 GEOCODE | Full corridor mapping needs lat/lng |
| Did branches of my family migrate in clusters? | 🟢 NOW | Multiple individuals, same place, same decade |
| Which ancestors died in a different country than born? | 🟢 NOW | birth_place country ≠ death_place country |
| Which ancestors died in a different state than born? | 🟢 NOW | birth_place state ≠ death_place state |
| What are the top 10 towns my family lived in? | 🟢 NOW | COUNT events by normalized place |
| What are the top 10 counties? | 🟢 NOW | Parse county from normalized place |
| What are the top 10 states? | 🟢 NOW | Parse state from normalized place |
| What are the top 10 countries? | 🟢 NOW | Parse country from normalized place |
| What percentage lived in New England? | 🟢 NOW | Text match on NE states |
| What percentage lived in the South? | 🟢 NOW | Text match on Southern states |
| What percentage lived in Canada? | 🟢 NOW | Text match |
| Which places appear only once? | 🟢 NOW | COUNT = 1 |
| Which places appear across multiple generations? | 🟢 NOW | COUNT distinct birth_centuries per place |
| Who lived in Massachusetts before 1700? | 🟢 NOW | Text match + year filter |
| Who lived in Rhode Island during Colonial period? | 🟢 NOW | Text match + year filter |
| Who lived in Quebec before emigrating to New England? | 🟢 NOW | Sequential place events logic |
| Who lived in England before emigrating to America? | 🟢 NOW | Sequential place events logic |
| Who lived in Ireland during the Great Famine? | 🟢 NOW | Text match + year filter |
| Who lived in France before emigrating? | 🟢 NOW | Text match |
| Who lived in a place that no longer exists? | 🟡 GEOCODE | Needs Geonames historical name matching |
| Who lived in a place that was part of a different country at the time? | 🔵 API | Geonames + historical boundary data |
| Which ancestors lived within 50 miles of each other (non-family)? | 🟡 GEOCODE | Radius query needs lat/lng |
| Which ancestors lived in the same town in different centuries? | 🟢 NOW | Text match + GROUP BY century |
| Which surnames dominated particular towns? | 🟢 NOW | GROUP BY place, surname |
| Where did the most members of a specific surname line live? | 🟢 NOW | GROUP BY surname, place |

**Subtotal: 24 🟢 NOW, 9 🟡 GEOCODE, 2 🔵 API**

---

## IV. Geographic — External Data Enrichment

| Query | Flag | Notes |
|---|---|---|
| Find all ancestors with known burial locations | 🟢 NOW | BURI events in events table |
| Find ancestors buried in the same cemetery | 🟢 NOW | BURI place text match |
| Find ancestors buried in cemeteries I'm currently near | 🔵 API | BillionGraves GPS |
| Which ancestors have photographed gravestones? | 🔵 API | BillionGraves photo data |
| Which ancestors have no known burial location? | 🟢 NOW | No BURI event |
| Which cemeteries appear most frequently in my tree? | 🟢 NOW | GROUP BY BURI place |
| Find historical newspapers from ancestor towns | 🔵 API | Chronicling America |
| What was in the news when my ancestor was born? | 🔵 API | Chronicling America + date |
| What was in the news when my ancestor died? | 🔵 API | Chronicling America + date |
| What advertisements appeared in ancestor's town and era? | 🔵 API | Chronicling America |
| What were major local stories in ancestor's community? | 🔵 API | Chronicling America |
| What was the winter like when my ancestor emigrated? | 🔵 API | Meteostat |
| What were weather conditions in year of death? | 🔵 API | Meteostat |
| Which ancestors lived through historically severe winters? | 🔵 API | Meteostat |
| Which ancestors lived in drought-affected areas? | 🔵 API | Meteostat + geocoding |
| Historical context for any ancestor's place and time | ⚫ AI | Claude Sonnet + Wikidata |
| Newspaper context surfaced as "their world" | 🔵 API | Chronicling America |
| Historical event enrichment per ancestor | ⚫ AI | Wikidata + Claude Sonnet |

**Subtotal: 5 🟢 NOW, 11 🔵 API, 2 ⚫ AI**

---

## V. Identity — Names and Naming Patterns

| Query | Flag | Notes |
|---|---|---|
| What are all the surnames in my tree? | 🟢 NOW | DISTINCT surname |
| Which surname appears most frequently? | 🟢 NOW | COUNT GROUP BY surname |
| Which surnames have died out in my direct line? | 🟢 NOW | Surnames with no living descendants |
| Which surnames are unique (appear only once)? | 🟢 NOW | COUNT = 1 |
| Which surnames cluster in particular regions? | 🟢 NOW | JOIN events places GROUP BY surname, state |
| Which surnames cluster in particular eras? | 🟢 NOW | GROUP BY surname, birth century |
| Which surnames are of English / French / Irish origin? | ⚫ AI | Needs AI or ethnicity lookup table |
| Which surnames changed spelling across generations? | ⚫ AI | Fuzzy string matching across generations |
| Which surnames were anglicized from another language? | ⚫ AI | AI inference from name patterns |
| Are there surname patterns suggesting ethnic heritage? | ⚫ AI | AI inference |
| What are the most common given names by era? | 🟢 NOW | COUNT given_name GROUP BY birth century |
| What are the most common given names by surname line? | 🟢 NOW | GROUP BY surname, given_name |
| Are there given names that repeat across generations? | 🟢 NOW | Same given_name across 2+ generations in a line |
| Most popular name in each century? | 🟢 NOW | MODE given_name GROUP BY century |
| Which given names appear only once? | 🟢 NOW | COUNT = 1 |
| Which names appear in both male and female variants? | 🟢 NOW | Same name, both M and F sex values |
| Are there distinctly Puritan names in Colonial ancestors? | 🟢 NOW | Known Puritan name list + era filter |
| Are there distinctly French names in Canadian lines? | 🟢 NOW | Known French name list + Canada place filter |
| Which names fell out of use and when? | 🟢 NOW | Last appearance by decade |
| Which names were revived after skipping a generation? | 🟢 NOW | Gap detection in name recurrence |
| Which ancestors share my exact name? | 🟢 NOW | Exact match on given + surname |
| Are there naming patterns suggesting religious traditions? | ⚫ AI | Biblical name list + AI inference |
| Which ancestors share a name with a parent (Sr/Jr)? | 🟢 NOW | Parent-child same name detection |
| Are there family naming conventions? | ⚫ AI | Pattern detection across generations |
| Which names appear in 3+ consecutive generations? | 🟢 NOW | Recursive lineage name tracking |

**Subtotal: 18 🟢 NOW, 5 ⚫ AI**

---

## VI. Occupation and Social History

| Query | Flag | Notes |
|---|---|---|
| What were the most common occupations? | 🟠 GEDCOM-SPARSE | OCCU tag — present in some Ancestry exports |
| How did occupations change across generations? | 🟠 GEDCOM-SPARSE | Same |
| Occupations by region? | 🟠 GEDCOM-SPARSE | Same |
| Occupations by era? | 🟠 GEDCOM-SPARSE | Same |
| Occupational dynasties (same profession, multi-gen)? | 🟠 GEDCOM-SPARSE | Same |
| Which ancestors were farmers? | 🟠 GEDCOM-SPARSE | Same |
| Which ancestors worked in mills or factories? | 🟠 GEDCOM-SPARSE | Same |
| Which ancestors were clergy? | 🟠 GEDCOM-SPARSE | Same |
| Which ancestors were in military service? | 🟠 GEDCOM-SPARSE | MILI tag or OCCU — sparse |
| Which ancestors were physicians? | 🟠 GEDCOM-SPARSE | OCCU tag |
| Which ancestors were teachers? | 🟠 GEDCOM-SPARSE | OCCU tag |
| Which ancestors were mariners or fishermen? | 🟠 GEDCOM-SPARSE | OCCU tag |
| Did occupations shift from rural to urban? | 🟠 GEDCOM-SPARSE | OCCU + place data combined |
| Which occupations have disappeared? | 🟠 GEDCOM-SPARSE + ⚫ AI | Needs OCCU data + AI to classify obsolete trades |
| Which ancestors were likely in poverty? | ⚫ AI | AI inference from era, place, family size |
| Which ancestors lived through economic depressions? | 🟢 NOW | Temporal overlap with known depression dates |
| Which ancestors likely owned land? | ⚫ AI | AI inference from era and location |
| Which ancestors were likely tenant farmers? | ⚫ AI | AI inference |
| Which ancestors lived in industrial mill towns? | 🟢 NOW | Place text match on known mill towns + era |
| Which ancestors lived in fishing communities? | 🟢 NOW | Place text match on coastal towns + era |
| Which ancestors lived in frontier territories? | 🟢 NOW | Already covered in geographic section |
| Which ancestors were part of logging communities? | 🟢 NOW | Place text match on known logging regions + era |

**Subtotal: 5 🟢 NOW, 13 🟠 GEDCOM-SPARSE, 4 ⚫ AI**

---

## VII. Health and Mortality Patterns

| Query | Flag | Notes |
|---|---|---|
| Leading causes of death in my ancestors' eras and places? | ⚫ AI | AI + Wikidata historical mortality data |
| Which ancestors likely died in epidemics? | 🟢 NOW | Death year matches known epidemic years in their location |
| Which ancestors died during known epidemic years? | 🟢 NOW | Curated epidemic year/place library |
| Which ancestors died young (before 40)? | 🟢 NOW | death_year - birth_year < 40 |
| Which families had high infant mortality? | 🟢 NOW | COUNT children with death age < 5 per family |
| Which families had clusters of deaths in short period? | 🟢 NOW | Multiple deaths within 2-year window, same family |
| Which decades had highest family mortality? | 🟢 NOW | GROUP BY decade of death_year |
| Are there mortality patterns suggesting hereditary conditions? | ⚫ AI | AI pattern analysis across lineage death ages |
| Which ancestors survived to old age despite harsh conditions? | 🟢 NOW | Age > 75, born before 1850 |
| Which ancestors died in war? | 🟠 GEDCOM-SPARSE | Cause of death rarely in GEDCOM |
| Which ancestors died in childbirth? | 🟠 GEDCOM-SPARSE | Cause of death rarely in GEDCOM |
| Are there family lines with consistently longer lifespans? | 🟢 NOW | AVG lifespan GROUP BY paternal/maternal line |
| Are there family lines with consistently shorter lifespans? | 🟢 NOW | Same |
| Did longevity improve faster in some lines than others? | 🟢 NOW | Trend comparison across lines |
| Which ancestors lived to 80+ when that was exceptional? | 🟢 NOW | Age > 80, born before 1800 |
| Death clusters suggesting epidemic events? | 🟢 NOW | Temporal clustering detection |
| Which ancestors were alive during the 1918 flu but survived? | 🟢 NOW | Alive 1918, death_year > 1919 |
| Which ancestors were alive during major cholera outbreaks? | 🟢 NOW | Overlap with known outbreak dates by location |

**Subtotal: 12 🟢 NOW, 2 🟠 GEDCOM-SPARSE, 4 ⚫ AI**

---

## VIII. Military and Conflict

| Query | Flag | Notes |
|---|---|---|
| Which ancestors served in the military? | 🟠 GEDCOM-SPARSE | MILI tag — present in some exports, sparse |
| Which ancestors were of fighting age during each major war? | 🟢 NOW | Age 18–45 during each war's years, male |
| Which wars affected most family members simultaneously? | 🟢 NOW | Temporal overlap count per war |
| Multiple family members serving in same war? | 🟢 NOW | Age filter + family relationship |
| Which ancestors lived in combat zones during conflicts? | 🟡 GEOCODE | Needs place + geocoding for zone matching |
| Which ancestors were in the Continental Army? | 🟠 GEDCOM-SPARSE | MILI tag |
| Which ancestors served in the War of 1812? | 🟠 GEDCOM-SPARSE | MILI tag |
| Which ancestors served in the Civil War (Union)? | 🟠 GEDCOM-SPARSE | MILI tag |
| Which ancestors served in the Civil War (Confederate)? | 🟠 GEDCOM-SPARSE | MILI tag |
| Which ancestors served in the Spanish-American War? | 🟠 GEDCOM-SPARSE | MILI tag |
| Which ancestors served in WWI? | 🟠 GEDCOM-SPARSE | MILI tag |
| Which ancestors served in WWII? | 🟠 GEDCOM-SPARSE | MILI tag |
| Which ancestors served in the Korean War? | 🟠 GEDCOM-SPARSE | MILI tag |
| Which ancestors served in Vietnam? | 🟠 GEDCOM-SPARSE | MILI tag |
| Which ancestors were of fighting age but in non-combatant countries? | 🟢 NOW | Age filter + place country (e.g. Canada) |
| Which ancestors were refugees or displaced by conflict? | ⚫ AI | AI inference from migration patterns + conflict dates |
| Which families had members on both sides of the Civil War? | 🟢 NOW | Family members in Union vs Confederate states 1861–1865 |
| Fighting-age ancestors during the Revolution by location? | 🟢 NOW | Age + place filter |

**Subtotal: 5 🟢 NOW, 1 🟡 GEOCODE, 10 🟠 GEDCOM-SPARSE, 2 ⚫ AI**

---

## IX. Immigration and Ethnicity

| Query | Flag | Notes |
|---|---|---|
| Which ancestors were born outside the United States? | 🟢 NOW | birth_place country ≠ USA |
| Which ancestors immigrated to the United States? | 🟢 NOW | birth country ≠ USA, later resi/death in USA |
| In what decades did the most immigration occur? | 🟢 NOW | GROUP BY decade of first US event |
| Which countries of origin appear in my tree? | 🟢 NOW | DISTINCT birth_place country |
| What immigration waves is my family part of? | 🟢 NOW | Date + origin country pattern matching |
| Which ancestors were first-generation Americans? | 🟢 NOW | Born outside USA, children born inside |
| Which ancestors were second-generation Americans? | 🟢 NOW | Parents born outside USA, self born inside |
| Which ancestors retained non-English surnames multi-gen? | 🟢 NOW | Surname origin classification + generation count |
| Which ancestors naturalized as citizens? When? | 🟠 GEDCOM-SPARSE | NATU tag — occasionally present |
| Which ancestors emigrated during Puritan Great Migration (1620–1640)? | 🟢 NOW | Birth in England, arrival in New England 1620–1640 |
| Which ancestors emigrated from Ireland during the Famine? | 🟢 NOW | Birth place Ireland + first US event 1845–1855 |
| Which ancestors emigrated from Quebec to New England? | 🟢 NOW | Birth place Quebec + later resi New England |
| Which ancestors emigrated from elsewhere in Canada? | 🟢 NOW | Birth country Canada + later US events |
| Which ancestors emigrated from continental Europe? | 🟢 NOW | Birth country Europe (non-UK/Ireland) |
| Which ancestors appear to have emigrated as a family group? | 🟢 NOW | Multiple family members, same origin, same decade |
| Which ancestors emigrated alone? | 🟢 NOW | Single individual, no family members same origin/decade |
| How many generations before immigrant line produced native-born? | 🟢 NOW | Recursive generation count from first US birth |

**Subtotal: 15 🟢 NOW, 1 🟠 GEDCOM-SPARSE**

---

## X. Family Structure and Relationships

| Query | Flag | Notes |
|---|---|---|
| Which individuals have the most descendants? | 🟢 NOW | Recursive descendant count |
| Which individuals are common ancestors of most lines? | 🟢 NOW | Ancestor appears in multiple descendant paths |
| Who are the "gateway ancestors"? | ⚫ AI | AI + Wikidata to identify historically documented families |
| Which individuals appear as both ancestors and in-laws? | 🟢 NOW | Individual appears in multiple family records in different roles |
| Are there cousin marriages? | 🟢 NOW | Shared ancestor detection between spouses |
| How many times do surnames appear on both sides of a marriage? | 🟢 NOW | Husband surname = Wife surname |
| Which family lines are most extensively documented? | 🟢 NOW | Record count per line |
| Which family lines are thinnest? | 🟢 NOW | Record count per line |
| Who has the most children documented? | 🟢 NOW | COUNT children in families table |
| Who has the most grandchildren documented? | 🟢 NOW | Two-level descendant count |
| Who has the most descendants documented? | 🟢 NOW | Full recursive count |
| Relationship path between any two individuals? | 🟢 NOW | Bidirectional ancestor graph traversal |
| Which two individuals are most distantly related? | 🟢 NOW | Maximum path length in tree |
| Which individuals are related by multiple paths? | 🟢 NOW | Multiple routes in ancestor graph |
| Are there duplicate individual records? | 🟢 NOW | Fuzzy name + date matching — already partially done in anomaly detection |
| Which individuals have the most siblings? | 🟢 NOW | COUNT children in same family record |
| Did siblings tend to settle near each other or scatter? | 🟡 GEOCODE | Sibling place comparison needs lat/lng for distance |
| Did extended families migrate together or separately? | 🟢 NOW | Family member place clustering by decade |
| Were there family clusters in same town across generations? | 🟢 NOW | Place recurrence across generations |
| Which families had members on both sides of the Civil War? | 🟢 NOW | Already covered in military section |
| Which families spanned multiple countries simultaneously? | 🟢 NOW | Family members with different country events in same year |

**Subtotal: 18 🟢 NOW, 1 🟡 GEOCODE, 1 ⚫ AI**

---

## XI. Data Quality and Research Intelligence

| Query | Flag | Notes |
|---|---|---|
| What percentage have known birth dates? | 🟢 NOW | COUNT birth_year IS NOT NULL / total |
| What percentage have known death dates? | 🟢 NOW | Same pattern |
| What percentage have known birth places? | 🟢 NOW | COUNT birth_place IS NOT NULL / total |
| What percentage have known death places? | 🟢 NOW | Same |
| Which surname lines have worst data coverage? | 🟢 NOW | Coverage score GROUP BY surname |
| Which surname lines have best data coverage? | 🟢 NOW | Same |
| Which centuries have most complete records? | 🟢 NOW | Coverage by birth century |
| Which centuries have most gaps? | 🟢 NOW | Same |
| Which ancestors have no parents documented? | 🟢 NOW | No family_as_child record |
| Which ancestors have no children documented (but of child-bearing age)? | 🟢 NOW | No children + birth_year in fertile range |
| Which ancestors have no place information? | 🟢 NOW | No place in any event |
| Which family lines go cold before 1800? Before 1700? | 🟢 NOW | Terminal ancestor birth_year by line |
| Which ancestors have only approximate or estimated dates? | 🟢 NOW | year_confidence = 'approximate' or 'estimated' |
| Which ancestors have conflicting date information? | 🟢 NOW | Already in anomaly detection |
| Which ancestors have names but no dates? | 🟢 NOW | birth_year IS NULL AND death_year IS NULL |
| Which ancestors have dates but no places? | 🟢 NOW | Dates present, all event places null |
| Where to focus research to extend oldest lines? | ⚫ AI | AI suggests archives based on place + era |
| Which ancestors likely have records in specific archives? | ⚫ AI | AI maps place/era to known record repositories |
| Which ancestors appear born before their parents? | 🟢 NOW | Already in anomaly detection |
| Which ancestors have implausible lifespans? | 🟢 NOW | Already in anomaly detection |
| Which ancestors have future dates? | 🟢 NOW | Already in anomaly detection |
| Which ancestors have dates far from nearest relatives? | 🟢 NOW | Already in anomaly detection |
| Which marriages show no children despite long duration? | 🟢 NOW | Marriage duration > 10 years, no children |
| Which individuals share identical names and similar dates (duplicates)? | 🟢 NOW | Already in anomaly detection |
| Which places in my tree have changed names? | 🔵 API | Geonames historical name data |

**Subtotal: 22 🟢 NOW, 2 ⚫ AI, 1 🔵 API**

---

## XII. Meaning-Making Queries

| Query | Flag | Notes |
|---|---|---|
| Which ancestor would I most have wanted to meet? | ⚫ AI | AI synthesis across all biographical data |
| Which ancestor had the most difficult life? | ⚫ AI | AI scores on hardship indicators |
| Which ancestor had the most eventful life? | 🟢 NOW | COUNT events per individual |
| Which ancestor lived through the most historical events? | 🟢 NOW | Temporal overlap count with curated event library |
| Which ancestor traveled the most? | 🟢 NOW | COUNT distinct places per individual |
| Which ancestor's life most resembles mine? | ⚫ AI | AI comparison of life structure (needs user profile) |
| Which ancestor shares my birthday? | 🟢 NOW | Needs user DOB — simple match on month/day |
| Which ancestor died on my birthday? | 🟢 NOW | Same |
| Which ancestor was born in the same place I was born? | 🟢 NOW | Needs user birthplace |
| Which ancestors were alive at the same time as famous historical figures? | ⚫ AI | AI + Wikidata famous person database |
| If I could have a conversation with one ancestor, who and why? | ⚫ AI | Pure AI synthesis |
| Which ancestor's story is most worth telling to the next generation? | ⚫ AI | AI synthesis |
| Which line of my family has been in America the longest? | 🟢 NOW | MIN birth_year in USA by line |
| How many generations in a specific town? | 🟢 NOW | Generational count filtered by place |
| What is the oldest place my family has continuously lived? | 🟢 NOW | Place appearing across most consecutive generations |
| What is the farthest my family has ever lived from its origins? | 🟡 GEOCODE | Distance from origin lat/lng |
| Which ancestor lived in the most places? | 🟢 NOW | COUNT distinct places |
| Which line has the richest biographical data? | 🟢 NOW | Event count per line |
| Which ancestor was alive the longest before any of their siblings? | 🟢 NOW | Birth order + lifespan comparison |
| Which ancestor survived the most people they were close to? | 🟢 NOW | Deaths of spouse, children, siblings during their lifetime |

**Subtotal: 11 🟢 NOW, 1 🟡 GEOCODE, 7 ⚫ AI**

---

## XIII. "This Day" Notification Feed

| Query | Flag | Notes |
|---|---|---|
| Which ancestors were born on this date? | 🟠 GEDCOM-SPARSE | Needs full date (month+day) not just year — often absent |
| Which ancestors died on this date? | 🟠 GEDCOM-SPARSE | Same |
| Which ancestors were married on this date? | 🟠 GEDCOM-SPARSE | Same |
| Historical events on this date in ancestor locations? | ⚫ AI | Wikidata + AI |
| Which ancestors were alive exactly 100 years ago today? | 🟢 NOW | Year-level precision sufficient |
| Which ancestors were alive exactly 200 years ago today? | 🟢 NOW | Same |
| What was happening when my oldest ancestor was born? | ⚫ AI | AI + Wikidata |
| Which ancestor's birthday is coming up this week? | 🟠 GEDCOM-SPARSE | Needs month+day |
| Which ancestor's death anniversary is this week? | 🟠 GEDCOM-SPARSE | Needs month+day |
| What season, and which ancestors were born in this season? | 🟠 GEDCOM-SPARSE | Needs month data |

**Subtotal: 2 🟢 NOW, 6 🟠 GEDCOM-SPARSE, 2 ⚫ AI**

*Note: The "This Day" feature works better than it seems despite the GEDCOM-SPARSE flags. Many Ancestry exports DO include full dates for well-documented ancestors. Even with partial data, year-level "this week 200 years ago" notifications are compelling and build-able now.*

---

## XIV. Cousin Discovery Network (V3)

| Query | Flag | Notes |
|---|---|---|
| Do any other Witness users share ancestors with me? | 🔴 V3 | Requires other users' imported trees |
| Which of my ancestors appear in other users' trees? | 🔴 V3 | |
| What is the closest shared ancestor between me and another user? | 🔴 V3 | |
| How many users share my Haskell line? My Howe line? | 🔴 V3 | |
| Which of my ancestor records could be enriched by another user's data? | 🔴 V3 | |
| Which of my gaps might be filled by another user's tree? | 🔴 V3 | |
| Are there ancestors with conflicting data in another user's tree? | 🔴 V3 | |
| Which ancestor has the most "witnesses" across multiple trees? | 🔴 V3 | |
| Relationship path between me and another Witness user? | 🔴 V3 | |
| Which ancestors are most likely to appear in other trees? | 🟢 NOW | Can pre-compute likelihood score from surname + place + era popularity |

**Subtotal: 1 🟢 NOW, 9 🔴 V3**

---

## XV. Family Dashboard — Aggregated Insights

| Query | Flag | Notes |
|---|---|---|
| How many countries does my family span? | 🟢 NOW | DISTINCT countries from normalized places |
| How many US states does my family span? | 🟢 NOW | DISTINCT states |
| How many centuries does my family span? | 🟢 NOW | MAX - MIN birth century |
| What is the total documented life-years in my tree? | 🟢 NOW | SUM of all individual lifespans |
| What is the geographic center of my family tree? | 🟡 GEOCODE | Mean lat/lng of all geocoded places |
| What is the temporal center? | 🟢 NOW | Mean birth year across all ancestors |
| How has geographic spread changed by decade? | 🟡 GEOCODE | Needs lat/lng for spread calculation |
| What is my family's center of gravity by era? | 🟡 GEOCODE | Mean lat/lng per era |
| Which decade saw the most births? | 🟢 NOW | GROUP BY decade of birth_year |
| Which decade saw the most deaths? | 🟢 NOW | GROUP BY decade of death_year |
| Which decade saw the most marriages? | 🟢 NOW | GROUP BY decade of marriage_year |
| Ratio of documented men to documented women? | 🟢 NOW | COUNT GROUP BY sex |
| How complete is my tree vs theoretical completeness? | 🟢 NOW | Actual vs 2^n ancestors at each generation |
| At what generation does completeness degrade? | 🟢 NOW | Generation-by-generation completeness curve |
| Which generation has the most individuals documented? | 🟢 NOW | COUNT per generation depth |

**Subtotal: 11 🟢 NOW, 4 🟡 GEOCODE**

---

## Master Summary

| Flag | Count | What it means |
|---|---|---|
| 🟢 **NOW** | **213** | Buildable today against current schema |
| 🟡 **GEOCODE** | **22** | One geocoding pipeline run unlocks these |
| 🔵 **API** | **15** | Specific external API integrations needed |
| 🟠 **GEDCOM-SPARSE** | **37** | Query valid — data often absent in real GEDCOMs |
| ⚫ **AI** | **33** | Claude Sonnet inference layer needed |
| 🔴 **V3** | **9** | Cousin discovery network required |
| **Total** | **329** | *(42 dropped as duplicates across sections)* |

---

## Build Priority Sequence

### Immediate — Phase 2 Query Engine (213 queries)
Everything flagged 🟢 NOW is buildable in your current sprint. This is the core product.

**Highest impact NOW queries to ship first:**
1. Historical event temporal overlaps (the King Philip's War class) — emotionally powerful, immediately demonstrable
2. Geographic place text matching — powers "I'm in this town" feature
3. Lifespan and family structure analytics — generates the dashboard stats
4. Immigration origin detection — deeply personal for most users
5. Data coverage / research gap analysis — practical value for serious genealogists
6. Relationship path finder — "how are these two people related?"
7. Ancestor event count — powers "most eventful life" meaning-making queries

### Near-term — Run Geocoding Pipeline (22 more queries)
One pipeline run against Nominatim/Geonames populates lat/lng on your 3,808 places. Unlocks migration direction analysis, radius search, distance calculations, and all map features. This is a Claude Code session, not a feature build — it's a script you run once and update incrementally.

### Phase 3 — AI Enrichment (33 queries)
The meaning-making and "most interesting ancestor" queries that require Claude Sonnet synthesis. Also unlocks "gateway ancestors" identification via Wikidata and historical context generation.

### Phase 3+ — API Integrations (15 queries)
BillionGraves for cemetery GPS, Chronicling America for newspaper context, Geonames for historical place names, Meteostat for historical weather.

### Manage Expectations — GEDCOM-Sparse (37 queries)
Build these queries fully — but surface them gracefully when data is absent. "Your tree doesn't have enough occupation data for this analysis yet — here's how to add it in Ancestry." Turn data gaps into research motivation, not dead ends.

### V3 — Cousin Discovery (9 queries)
After user base reaches sufficient scale to make matching meaningful. Design the data model for it now (it's already in the schema). Activate when the network exists.

---

*Audit complete — 329 distinct queries categorized (371 including cross-section duplicates). This file lives at `docs/QUERY_LIBRARY.md` in the Witness repo.*
