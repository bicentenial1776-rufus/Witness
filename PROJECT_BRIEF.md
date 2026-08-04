# Witness — Family History Intelligence
### *Witnesses to History*

**Version:** 2.2 — Project Brief (living document)  
**Date:** July 2026  
**Status:** In development — Phases 1–5 substantially complete: iOS running on real devices (TestFlight build 5), **web app launched** at app.witnesslives.com (RevenueCat Web Billing, own "Broadsheet" design system), onboarding + hard paywall live. Phase 6 (launch) prep underway — BillionGraves, proactive location notifications, and encrypted-GEDCOM-upload wiring remain open. Build Status section below is authoritative.

---

## What Witness Is

Witness is an iOS and iPad app that transforms a genealogy GEDCOM file into an intelligent discovery experience. It is not a tree builder. It is an analysis and meaning-making layer that sits on top of trees people have already built in Ancestry, FamilySearch, or any standard genealogy platform.

The core insight: platforms like Ancestry are excellent for researching and constructing family trees. They are poor at answering the questions that make a family tree meaningful — who was alive during a historical event, which ancestors lived in a place you're standing in, what patterns emerge across generations, how your family fits into the sweep of history.

Witness answers those questions.

**Tagline:** Witnesses to History

---

## The Problem It Solves

A serious genealogist may have 5,000+ people in their family tree, years of research invested, and no way to answer basic questions like:

- Who in my family was alive during King Philip's War?
- I'm standing in this cemetery — is anyone here related to me?
- I'm visiting Providence, Rhode Island — who in my family lived here?
- Which of my ancestors had the most interesting life?
- What patterns emerge across my family's migrations?
- I've hit a brick wall at 1720 — what should I research next?

Ancestry and FamilySearch are built for research and construction. Discovery, analysis, and historical context are afterthoughts. Witness is built for exactly that gap.

---

## The Bigger Story

Witness is not a query tool that exhausts itself. It is a **living chronicle** — a family asset that deepens over time and is designed to be passed from one generation to the next.

Every year that passes, there is more history to connect to. More records get digitized. More context becomes available. More calendar moments surface. External data sources keep expanding — Witness connects all of it to a specific tree without the user doing anything. A user who has been with Witness for five years has a fundamentally richer product than one who joined yesterday.

The right metaphor is a **timeshare in time** — a stake in something that exists across time, compounds with accumulation, and can be transferred to the people who come after you. When a subscriber passes their Witness account to a child or grandchild, what transfers is not a software subscription. It is a curated, interpreted, enriched version of the family story — one the next generation inherits as a gift and continues to build.

**In one sentence:** Witness is the place where your family's history comes alive — a living, deepening record that grows more valuable with every passing year and is designed to be given, one generation to the next, as a gift.

---

## Target User

- Age 45–70, skews 55+
- Serious genealogist with a meaningful tree (500+ people, multiple generations)
- Already an Ancestry subscriber ($240–720/year)
- Uses iPhone and iPad; comfortable with technology
- Has exported a GEDCOM file at least once
- Motivated by family legacy, historical connection, and sharing discoveries with family
- Often identifies strongly with a specific branch or heritage (Acadian, Colonial New England, Irish immigrant, etc.)

---

## Platform

- **Launch:** iPhone + iPad (near-feature parity, adaptive layouts) **+ web**, launched ahead of schedule (July 2026) at app.witnesslives.com
- **iPad** is the primary canvas for deep research sessions
- **iPhone** is the field device — cemetery GPS, "I'm Here" mode, sharing moments
- **Web** runs its own "Broadsheet" design system (IBM Plex Mono, letterpress/newspaper aesthetic) on viewports ≥900px, gated by `useBroadsheet()`; below that it falls back to the phone's tab bar. Same five-tab IA as the phone (Home · Tree · Explore · Map · Nearby), billing via RevenueCat Web Billing (Stripe checkout in-page) instead of Apple IAP, browser geolocation instead of device GPS for Nearby, and an email digest (Resend) standing in for local push where native notifications aren't available.
- Built with **React Native / Expo**

---

## Business Model

- **Price:** $19.99/year
- **Trial:** 30 days, full access
- **Model:** Single tier, all features included — no upsell, no feature gating
- **Future:** Family plan at $34.99/year (up to 5 accounts, V2)
- **Apple cut:** 15% (Small Business Program) — net ~$17/user/year

**Revenue targets:**
- Year 1: 2,000–3,000 users → $34K–$51K net ARR
- Year 2: 4,000–7,000 users → $68K–$119K net ARR
- Bull case: 15,000–25,000 users → $255K–$425K net ARR

---

## Core Features — V1

### GEDCOM Import
- Full GEDCOM 5.5.1 parser (Ancestry) and GEDCOM 7.0 (FamilySearch), including .gdz archives, with version auto-detection and graceful fallback
- Ancestry extension capture: UID/_UID (re-import matching), _MILT military events, _PRIM photo flags, _APID record ids, _FREL/_MREL child relationship qualifiers
- Import via Files app, iCloud Drive, AirDrop, email attachment
- Handles large files (10MB+, 5,000+ individuals)
- Client-side encryption before upload to Supabase
- Background normalization pipeline (places, dates)
- Re-import diff — shows what changed since last import, celebrates growth

### Temporal Queries
- "Who was alive during [historical event]?" engine
- 20+ pre-built historical event queries (King Philip's War, American Revolution, Civil War, WWI, WWII, 1918 flu, etc.)
- User-browsable prompt card library
- Fuzzy date handling with confidence indicators

### Geographic Queries
- Place-based ancestor lookup
- GPS radius search from current location
- State / country / region rollups
- Migration path detection across generations

### Branch Focus / Identity Lens
- User designates a heritage branch (Acadian, Colonial New England, French Canadian, etc.)
- Entire product reorients around that lens — queries, historical context, map, notifications
- Visual identity shifts with the active lens (Acadian = deep navy; Colonial = amber)
- Different family members can use different lenses on the same tree
- Branch detection is automatic based on surname clusters and geographic concentrations

### AI Historical Context Enrichment
- Per-ancestor historical narrative generated by Claude Sonnet
- Wikidata integration for structured historical event data
- Chronicling America integration for historical newspaper context
- Response caching (AI results cached server-side)
- Rate limiting: 20 AI queries per day per user

### Ancestor Biography
- AI-generated 300-word life narrative per ancestor
- Synthesizes dates, places, family structure, and historical context
- Warm, readable prose — not a data dump
- Living persons explicitly excluded
- "Remarkable life" indicator on ancestors with unusual biographical density (appears on ~3–5% of ancestors)

### Ancestor Timeline View
- Per-ancestor vertical chronology
- Personal events (births, marriages, deaths) interleaved with historical events
- Three dot types: personal (plum), regional history (amber), world events (grey)
- Makes the arithmetic of history emotional — users compute ages during events involuntarily

### Family Constellation View
- Node-based family visualization centered on a specific ancestor
- Dark background, node size proportional to data completeness
- Dim nodes for data gaps — turns incompleteness into research invitation
- Tapping any node pivots to that person's encounter view

### The Recognition Feature
- AI compares ancestor's life structure against user's profile
- Surfaces genuine parallels across generations (left homeland at similar age, similar family size, etc.)
- Appears rarely and only when parallels are genuine — not forced
- Most emotionally resonant feature in the product; design with care

### Shareable Discovery Cards
- Branded visual cards for discoveries ("47 of your ancestors were alive when the Declaration was signed")
- Visual identity carries the active lens (Acadian card looks Acadian; Colonial card looks Colonial)
- iOS share sheet integration
- Deep link back to app for non-users
- Primary organic growth mechanic

### Map View
- All ancestor locations plotted on a map
- Era slider to filter by time period
- Surname line filter
- Cluster behavior for dense regions

### Cemetery GPS Mode (iPhone)
- BillionGraves API integration
- GPS radius match against GEDCOM names and dates
- Fuzzy name matching with confidence scoring
- Confirmed vs. probable match distinction (visual language: solid vs. dashed border)
- Gravestone scan via camera — OCR reads inscription, flags data gaps
- Contribute photo to BillionGraves option (opt-in)
- Graceful fallback when no BillionGraves coverage

### "I'm Here" Mode (iPhone)
- Location-triggered ancestor lookup from GPS coordinates
- Proactive lock-screen notification when passing through ancestral territory
- Matches current town / county / region against normalized place index
- Era tabs: browse ancestors by century in a specific place
- Works offline with cached index

### Research Brief Generator
- AI-generated structured research document for a specific brick wall in the tree
- Triggered by user tap on a stuck ancestor, or proactively surfaced by Witness
- **Brief contains:**
  - Header block: family group, nature of wall, era, location, one-sentence framing
  - Research questions ordered by likelihood of yielding results
  - Specific suggested sources (named archives, databases, record types — not generic advice)
  - Historical context for why records may be missing (war, fire, pre-registration era, denomination gaps)
  - What breaking through looks like — the specific record that would open the next generation
  - Generation footer: date, tree name, witnesslives.com
- **Research Queue:** dedicated screen showing all open briefs with status (Open / In Progress / Resolved / Archived)
- When re-import fills a gap, Witness detects it and prompts to mark brief as resolved
- **Distribution:** iMessage/text, email, PDF/print, copy to clipboard (for genealogy forums)
- V3 addition: Community Brief — mark a brief as public so cousin network members can contribute

### This Week in Your Family (Notifications)
- Weekly push notification with birth/death anniversaries
- AI-written 2-sentence historical context per ancestor — never canned copy
- Tap-through to full ancestor view
- Three entries maximum per week digest; selected for variety and biographical richness

### Annual Family Wrapped
- Personalized annual summary surfaced in first week of December
- Headline number (discoveries made), named discoveries of the year, ancestor of the year
- Designed to be shared — primary organic acquisition mechanic
- Creates the annual ritual that drives subscription renewal

### iPad-Specific
- Sidebar + detail split view
- Full-screen explorable map
- Presentation mode (show family on a large screen — full-screen, minimal chrome)
- Landscape timeline view

### Inheritance Transfer
- Designed handoff of account from one generation to the next
- Legacy Summary: shows what was built, what remains open, the arc of discovery
- Letter: optional, written by giver in their own words, displayed to recipient on first open
- What transfers: full tree, AI biographies, branch lenses, discovery archive, annual Wrapped history, letter
- Subscription transfers or begins fresh for recipient
- "Inherited from [name]" badge on recipient's home screen, fades gracefully over time
- Suggested query connecting to unfinished work from previous owner

### Family Street View (V3 Concept — Design Now, Build Later)
- First-person spatial navigation through the family tree, in a full 3D environment (not isometric or fly-over) — chosen for immersion and emotional resonance, drawing on theatrical staging and Disney-park design language
- Each family unit rendered as a navigable house interior — period-accurate architecture, candlelit
- Figures sized proportionally to age at current date (time slider)
- Silhouette figures with period clothing; photos populate faces where available
- Back door exits to two houses side by side — the parents' families of origin
- Time slider animates the family: children grow, parents age, deaths cause figures to fade
- Tap any figure for detail card with biography and historical context
- "Records lost" graceful state for lines that end before documentation begins
- Proof of concept built; production version requires dedicated design sprint

**Navigation philosophy (decided Aug 2, 2026)**
- Ground-level perspective only — no "godlike" fly-over view, to preserve mystery and avoid the visual inconsistency of seeing unrelated areas side-by-side
- Central "hub" navigation (Disney-parks-style) guides users between houses/areas without forcing a fixed path, keeping flow effortless and cohesive

**Platform scope (decided Aug 2, 2026)**
- iPad and desktop only for the initial build — phone navigation explicitly deferred to reduce control complexity
- Target demographic skews older (median age ~55 in initial test group of ~20 non-gamers), so navigation must stay simple and intuitive, avoiding complex "two-hand" gaming controls

**Content, narrative, and disclosure (decided Aug 2, 2026)**
- Mandatory disclaimer required at the start of every experience clarifying that all historical conversations/dialogue are simulated ("words of the dead" — historically-grounded but AI-generated, never presented as literal fact)
- Narrative structure follows a three-act shape per scene (the "Lantern Keeper" demo is the reference example), with AI-driven variation so repeated visits don't feel scripted or repetitive
- A bookmarking feature lets users save memorable narrative moments to prevent repetition and build a personal record
- Content must suit a universal/general audience — avoid morbid or excessively graphic narratives; support multiple reading levels and writing modes for accessibility

**RPG / reward layer (decided Aug 2, 2026)**
- The environment functions as a light family RPG: quests such as gathering resources or assisting characters, generated (not scripted) to avoid repetition and preserve replayability
- Reward layer gives users a sense of impact — decorating a home with artifacts, building virtual shrines (in the spirit of the Mexican *ofrenda*)
- A virtual "notebook" collects past experiences as a recap/record and incentive to keep exploring

**Development strategy (decided Aug 2, 2026)**
- Strictly generative — no hardcoded assets or hand-authored "tailored demo" content; the experience must hold up as the actual product, not a scripted showcase
- "Good enough and doesn't break" is the bar per encounter, not perfection in every architectural detail — the taxonomy of historical architecture is too vast to hand-craft
- Design-system approach for architecture: period-appropriate house structures and landscaping (e.g., 1600s vs. 1900s) generated from a resource library rather than hardcoded per-house or fetched via constant API calls
- Isolate the relevant family's subtree from the full GEDCOM to streamline prompting and generation, rather than reasoning over the entire file each time
- Home-person routing: changing the "home person" setting (e.g., to a specific family member) automatically routes all Street View data to center on them — no manual per-person file authoring needed

**Cost and data sourcing (decided Aug 2, 2026)**
- Anthropic API cost estimated at ~$3/user/year — financially manageable at scale
- National Archives and DPLA (Digital Public Library of America) queries are free within published API rate limits, with headroom to request higher limits if needed; prioritize free public archives/library data over paid sources to keep token costs down
- Ancillary/explanatory data (e.g., household sleeping arrangements, period daily-life context) should be pulled from these external sources to give the AI instructive context beyond the tree itself

**Design and technology decisions (Aug 2026):** see [docs/Street_view_demos/TECH_RECOMMENDATIONS.md](docs/Street_view_demos/TECH_RECOMMENDATIONS.md) (platform: browser-hosted Three.js engine) and [docs/Street_view_demos/STREET_VIEW_DESIGN.md](docs/Street_view_demos/STREET_VIEW_DESIGN.md) (world layout, figures, period style packs, navigation, interaction, entry points), alongside the working demos in that folder.

**Open next steps (from Aug 2, 2026 meeting)**
- Compile the list of essential elements needed for a 3D environment to read as complete
- Combine this project brief with the meeting transcript to develop the foundational coding architecture
- Solidify house interior design elements for architectural distinctness
- Investigate a shared design-asset library for architecture and landscaping variety
- Test the current proof of concept with ~20 non-gamer users for feedback

---

## Shipped Beyond the Original V1 Plan

Built during Phase 4–5 in response to what the real 5,495-person tree and field testing surfaced — not in the original feature list above, but live now:

### Tree Health
- 22 forensic checks ported from FTAnalyzer (Apache 2.0 license; GPL-licensed FTAnalyzer data explicitly not used — see `NOTICE`)
- "Your Tree Health" workbench on Explore: 443 findings surfaced on the live tree after an audit pass corrected false convictions around estimated/`BET`/`BEF`/`AFT` date qualifiers and old-style dual dating (down from an initial 539, with 322 regression tests green)
- Findings framed as research invitations, consistent with the "anomalies are curiosities" principle
- Supersedes "The Ascent" (an earlier 8-generation ahnentafel health ladder with a scripted tutorial mode) — Ascent's screen still exists and is routable, but was pulled off the Explore shelf in favor of Tree Health

### National Archives (NARA) Document Matching
- pg_cron worker matches draft-registration and naturalization records to ancestors as confirm/dismiss candidates — never auto-attached
- Consolidated "National Archives" screen; "Add to Ancestry" bridge for Ancestry-sourced trees
- Hardened after launch: fixed a re-search bug that was re-querying the same men every ten minutes, made the monthly API quota ledger atomic

### Query Library & Moments Browsing
- The 329-query event library is now browsable and searchable directly, not just surfaced through AI prompt cards
- Century-grouped Moments timeline with live counts

### Story Sharing
- Public share links with OG-tag unfurls so a shared story renders a preview card off-platform, with a bridge back into the app for non-users

### Family Stage & Register (Phone + Web Navigation)
- Five-tab IA replaced the original Home/Explore/Map/Research/You layout: **Home · Tree · Explore · Map · Nearby** (Research folded into Tree)
- **Family Stage** — a household rendered as a lifeline (a length of time, not a static chart), with a set-switcher for people with multiple marriages, honest "?" for uncertain data
- **Register** — table-of-contents navigation by time, name, and place, without ever drawing the full tree
- Both ship identically on phone and web

### The Person View — "The Portrait"
- The ancestor detail screen (`ancestor/[id]`, the universal destination every tap and search routes to) rebuilt to **lead with the family**: a serif name headline, a mono span (sex-inked word · years · birthplace), the relationship as a one-line serif lede, then a register of **Parents / Brothers & sisters / Marriage + children** — every name tappable onward, the person themselves highlighted and shown in true birth order among their siblings
- Answers the plain relational questions a tree diagram is usually drawn for — *"does Patrick have siblings?"* — in one screen, without ever rendering a tree (the opinionated move over the me-too tree diagram)
- **Story** and **Their World** (AI historical context) open as inline accordions in place — the register below simply shifts down, nothing navigates away; Research left this card entirely (a person can't tell whether a brief needs generating — that belongs to Tree Health)
- Theme-aware sex-inks (men ink, women amber, unrecorded muted) so it reads in dark mode; collapses this tree's duplicate person/family records so a parent never shows twice
- Reached by **name or place search** — Explore's people search now matches a place ("Worcester" → everyone with an event there), not only names, closing the loop from a search to a person's siblings and family
- The more immersive reimagining (meeting a family "in their house" — see *Family Street View*) is parked for a dedicated design sprint; the Portrait is the shipped, everyday person view

---

## Features Explicitly Deferred

- **Tree editing** — Witness never modifies a GEDCOM. Read-only always.
- **Ancestry/FamilySearch write API** — not pursued. GEDCOM re-import is the sync model.
- **Cousin discovery network** — V3 feature. Opt-in, dead ancestors only.
- **Android** — deferred until iOS demonstrates product-market fit.
- **AI anomaly correction** — anomalies surfaced as curiosities, never sent back to source tree.

---

## Technical Architecture

### Stack
- **Frontend:** React Native / Expo (universal — iPhone, iPad, and web, all shipped)
- **Backend:** Supabase (Postgres + Storage + Auth + Real-time), pg_cron workers for geocoding, NARA matching, and digest generation
- **AI:** Anthropic Claude Sonnet API (claude-sonnet-4-6)
- **Subscriptions:** RevenueCat (native IAP) + RevenueCat Web Billing via Stripe (web) + Superwall placements layered on top
- **Maps:** Apple Maps (native, via `react-native-maps` default provider) / MapLibre GL over CARTO basemaps (web)
- **Web hosting:** Vercel, deployed from `docs/preview-site` at witnesslives.com root; email digest fallback via Resend

### Build Status (July 2026)
- ✅ GEDCOM parser — complete. Pure TypeScript, 24 tests, validated against real 11MB file. 5,495 individuals, 1,852 families, 3,808 places, parsed in 110ms.
- ✅ Supabase schema — 8 tables, RLS policies, indexes live on project bdjsahbjptpcmouqozvs
- ✅ Import pipeline — ParsedGedcom → DB rows, batched insert, 31 tests passing
- ✅ Live database write — full tree imported to hosted Supabase as an authenticated user and verified (5,495 individuals, ~45s)
- ✅ In-app GEDCOM import — file picker → parse → import with progress, tree list + delete on home screen (verified end-to-end in simulator)
- ✅ Temporal query engine — 26-event curated library, "alive during X" with documented/probable confidence, prompt cards + results screen in app. King Philip's War over 5,495 people: 413ms (milestone was <2s)
- ✅ Geographic queries — region rollups with canonicalized state/country names, ancestors-per-region, tree-wide migration paths (England → Massachusetts, 169 people, ~1679), places + migrations screens in app
- ✅ Geocoding pipeline — Nominatim at 1 req/sec; re-run against the re-imported tree in progress (2026-07-06; a fresh import starts ungeocoded)
- ✅ GPS radius query — haversine over geocoded places ("within 15km of Sudbury MA" → 84 places with ancestors); awaiting device-GPS UI in Phase 4
- ✅ AI ancestor biography — generate-biography Edge Function (Claude Sonnet 4.6, server-side key), enrichment_cache table, 1000/day budget (a runaway-loop circuit breaker, not a meter — raised from 20 during family beta; real cost ~0.7¢/biography), living persons refused server-side; ancestor detail screen in app (tap from any results list). Verified live: ~12s generate, ~400ms cache hit
- ✅ Historical context enrichment — Wikidata events + Chronicling America newspapers feed a per-ancestor "world they lived in" narrative; same cache and daily budget
- ✅ Shareable discovery cards — branded 1080×1350 card (ink/parchment/amber) captured from query results into the iOS share sheet
- ✅ Research Brief Generator — gap detection + structured brief (ordered questions, named archives, why records are missing, what breakthrough looks like); research queue with status lifecycle in app. Phase 3 milestone met.
- ✅ Home person + relationship engine — home-person designation with onboarding suggestion, closest-common-ancestor relationship calculator (pedigree collapse, half-relationships, in-laws, confidence), 1,033 direct ancestors pre-computed in ~5s, "your 7th great-grandmother" labels across all result screens. Verified: Katherine Marbury = 7th great-grandmother, paternal Scott line
- ✅ Ancestor map — era-filtered places on Apple Maps, callouts to per-place ancestor lists
- ✅ "I'm Here" mode — GPS radius search (500m–50km) with century tabs and relationship labels. Milestone verified: at Sudbury's cemetery, 103 people found, town places 29m away
- ✅ "This Week in Your Family" weekly digest — anniversary window query (month/day pushed down to Postgres) + editorial selection (max 3, variety across branches and event types, richness scoring, direct-ancestor and milestone boosts), digest screen with relationship labels, 2-sentence AI notes (new digest_note enrichment type, same cache/budget), Sunday-morning local notification named after the week's top entry, re-armed on every app open. Verified live: 81 candidates → 3 entries in ~120ms over the 5,495-person tree; screen verified in simulator. Phase 5 begun. digest_note migration + generate-digest-note Edge Function deployed and verified live (fresh note ~5s, cache hit ~0.5s, notes render in-app)
- ✅ Standalone Release build — Release-configuration install on Rufus's iPhone with the JS bundle embedded (no Metro/laptop dependency; travel-ready). Dev auto-login credentials blanked from release bundles via .env.production
- ✅ TestFlight — 1.0.0 build 1 archived (DEVELOPMENT_TEAM in app.json appleTeamId) and uploaded to App Store Connect via Xcode Organizer; bumped to **build 5** with onboarding + hard paywall (see below). dSYM warnings for RN prebuilt frameworks are expected and harmless. Privacy policy and Terms of Use are now live at witnesslives.com (previously open prerequisites); ASC API key for headless uploads still not set up
- ✅ Second real user — Ruth's iPhone 12 mini running her own account with her own tree import; geocoded instantly by copying coordinates from Rufus's tree on matching place strings (validated the shared-place-cache design). Keyboard-flow fixes on the sign screens came out of her first-run testing
- ✅ Richer GEDCOM facts — importer now captures occupations (OCCU), Ancestry custom events (EVEN + TYPE: draft registrations, citizenship, …), and probate (PROB) alongside the core five event types; label/detail columns feed all four AI prompts (bookkeeping noise like FamilySearch IDs filtered out). Backfills nothing: facts appear on next import
- ✅ Kindred couples — full-depth sweep (any shared blood ancestor, not just grandparents), per-spouse ancestor labels ("William Haskell is Ruth's 8th great-grandfather and Rufus's 9th"), and an expandable side-by-side descent diagram per couple, every person tappable. Found Rufus ⚭ Ruth as sixth cousins 1× removed via Abigail Maxey — closer than the Haskell line the family knew about
- ✅ Migration paths — vague-precision records ("United States" with no state) no longer count as moves against a known state; every path card opens a detail screen listing all movers with relationship labels, each linking to the ancestor page
- ✅ Query library + three surfaces — docs/QUERY_LIBRARY.md audits 371 queries (329 distinct) with buildability flags; implementation architecture is three surfaces, never a browsable catalog: "Lived Through" tags on ancestor cards (5 max, tier-ranked, geo-boosted, tap → results with that ancestor pinned), a curated monthly Explore shelf (result density, geographic match, lens affinity, anniversary proximity), and search. Event curation columns (tier, geo_scope, lens_affinity) seeded via migration with a bundled fallback pinned by a sync test
- ✅ Section II + X query engines — life milestones (longest-lived, infant mortality split, lifespan/marriage/family-size cohorts by century, surname line depths) and family structure (most descendants/grandchildren/siblings, duplicate candidates, same-surname marriages, families spanning countries, most-distant pair) as pure functions over a TreeIndex; acceptance invariants run against the real 5,495-person GEDCOM
- ✅ Section III place discovery — family origins (earliest dated event per region), sequential emigration ("Quebec before New England", westward-expansion preset), Atlantic/Pacific ocean crossings, born-vs-died displacement, top towns/counties/states/countries, region shares, multi-century anchor towns, chain-migration clusters, surname–place dominance; Origins and Ocean Crossings screens live on Explore (crossings collapse duplicate-line ancestors — shared ancestors appear once per voyage, not once per descent line). classifyPlace now resolves two-part places ("Massachusetts, USA") to the state
- ✅ Source citations — parser captures the GEDCOM's full evidence layer (980 source records, ~39,600 citations with fact labels, page locators, record-text excerpts, URLs, _APIDs); sources/citations tables live with RLS; tree re-imported 2026-07-06 as 47354505-… with home person carried over by xref and the July-1 tree deleted (staged, batched — a whole-tree cascade delete times out); ancestor screens show a Sources section ("cites their name, birth, residence", quoted excerpts, record links)
- ✅ Running on real hardware — dev client installed on Rufus's iPhone via `expo run:ios --device` (Apple Development signing; distribution cert present for TestFlight later). Phone loads Metro via the Mac's .local hostname — raw-IP http is blocked by ATS. Standalone Release build refreshed 2026-07-06 (sources UI + new tree) for two weeks away from the Mac
- ✅ Expo development build — native iOS dev client (expo-dev-client, bundle id com.witnesslives.witness) built via `npx expo run:ios` and verified on simulator; replaces Expo Go for development, prerequisite for push notifications, background location, and TestFlight. Native dirs are gitignored (CNG — regenerate with `npx expo prebuild`). Gotcha: CocoaPods needs LANG=en_US.UTF-8 in non-interactive shells
- ✅ Design system + navigation — brand tokens implemented app-wide (parchment/ink worlds, amber accent, serif display type via iOS New York), Card primitive, native headers with swipe-back on all detail screens, active-tree context (tab screens no longer need treeId params; deep links still param-driven). App renamed mobile → Witness, splash to ink. Light + dark mode verified in simulator across all tabs, digest, ancestor detail. Button + TextField primitives complete (no default iOS chrome remains). iPad tier 1 shipped: supportsTablet, all iPad orientations, capped content columns (native iPad app instead of compatibility mode). **Superseded 2026-07-25/26:** the five-tab layout is now Home · Tree · Explore · Map · Nearby (Research folded into Tree) — see Family Stage & Register below. Remaining polish: lens section accents, iPad split-view + landscape layouts
- ✅ Onboarding + hard paywall — 7-screen onboarding narrative gates every signed-in user into RevenueCat entitlement (`e26e8ba`, `a3ca73e`), Superwall placements layered on top, 7-day trial with a local reminder notification 2 days before conversion. Witness registered as a `.ged`/`.gdz` file handler (Share Sheet / Files / Mail "Open in Witness" skips the picker), enforced by a build-time check that fails if the handler registration goes missing. Shipped as build 5. Terms of Use and a rewritten privacy policy are live at witnesslives.com
- ✅ Tree Health — 22 forensic checks adapted from FTAnalyzer (Apache 2.0; GPL data not used, see `NOTICE`), audited down to 443 real findings with 322 regression tests green; live on Explore as "Your Tree Health." Supersedes the earlier Ascent health-ladder feature (screen still routable, un-featured)
- ✅ National Archives (NARA) matching — pg_cron worker matches draft-registration/naturalization records to ancestors as confirm/dismiss candidates (never auto-attached); consolidated screen + "Add to Ancestry" bridge; re-search and quota-ledger bugs fixed post-launch
- ✅ Family Stage & Register — household-as-lifeline visualization and time/name/place table-of-contents navigation, replacing tree-drawing UI; shipped identically on phone and web
- ✅ Query Library + Moments browsing — the 329-query event library and a century-grouped Moments timeline are directly browsable/searchable, not gated behind AI prompt cards
- ✅ Story sharing — public share links with OG-tag unfurls (preview card off-platform, bridge back into the app for non-users)
- ✅ **Web app launched** (2026-07-24 to 07-26, ahead of the V2 schedule) — full "Broadsheet" redesign (IBM Plex Mono, letterpress aesthetic) mirrors the phone's five-tab IA on viewports ≥900px; RevenueCat Web Billing (Stripe checkout in-page) stands in for Apple IAP; Ancestor Map ported to MapLibre GL over CARTO basemaps; Nearby uses browser geolocation; weekly digest also sends by email (Resend) for browser/iPad users without local push; deployed via Vercel from `docs/preview-site` at the witnesslives.com root. Late-stage hardening: full IA parity pass, and an `Alert.alert` sweep since react-native-web stubs it to a silent no-op (`showAlert`/`showDestructiveConfirm` now used everywhere; native tree-delete confirm still native, web gets `window.confirm`)
- ✅ Person view "The Portrait" — `ancestor/[id]` rebuilt to lead with the family register (parents / siblings with self highlighted in birth order / marriage + children, all tappable), name headline + mono span + relationship lede, Story and Their World as inline accordions, Research removed (moved to Tree Health). Answers "does X have siblings?" without drawing a tree; theme-aware sex-inks, duplicate-record collapsing. Verified on device across deceased/living/dark. Slated for the release after 1.1
- ✅ People search by name or place — Explore's search now runs the existing `full_name` match alongside a place query (`individual_events` joined to `places`, deduped to distinct people, each tagged with the matching place) and merges them; "Worcester" surfaces everyone with an event there, and every result taps into the Portrait. Same on the web Broadsheet ledger
- ✅ Parallel tree paging — `fetchAllPages` fetches the first page alone, then fans the rest out in ordered concurrent batches instead of one-at-a-time; heavy screens on the ~8.6k-row tree drop from ~11s to ~4s (events fetch measured 11.3s → 4.3s), byte-identical rows and order, 322 tests green
- ⬜ BillionGraves cemetery matching — deferred pending API access/outreach; radius search covers the cemetery case with tree data
- ⬜ Proactive location notifications, iPad split-view layouts — remaining Phase 4
- ✅ Encrypted raw GEDCOM upload to Storage — the file is encrypted on the device with AES-256-GCM (`expo-crypto`'s native AES, new in SDK 57 — no third-party crypto) and stored in the `gedcom-files` bucket; `trees.gedcom_path/_bytes/_uploaded_at` record where it went. The key is generated on the device, held in the iOS Keychain (`expo-secure-store`), and never sent anywhere — so "we store it, but we cannot read it" is literally true, and equally a stored file with no key and no saved recovery code is unreadable forever. The recovery code is viewable any time from You, and pasting one from an old device lets a new one open its files. Restore decrypts to a cache file and re-enters the ordinary import screen, landing as a new tree rather than overwriting. Upload is non-fatal — an imported tree is never failed over its backup copy — and deleting a tree removes the object so the bucket doesn't accumulate orphans. iOS/iPadOS only: a browser has nowhere safe to hold the key, so the vault is absent on web rather than downgraded
- ⬜ Family Constellation View — no node-based visualization exists in the codebase; the Ancestor Timeline (per-ancestor vertical chronology) is also still unbuilt as a dedicated view, though Moments browsing (above) covers tree-wide chronology

### Data Storage — Option B Encryption
- Raw GEDCOM file: encrypted client-side before upload, stored as opaque blob in Supabase Storage. Server cannot read it.
- Parsed individual index: stored in Supabase Postgres, queryable server-side for AI enrichment
- AI enrichment cache: stored server-side, no PII
- Living persons: additional client-side encryption layer, never included in any server-side processing

**Privacy claim (accurate and marketable):** *"Your GEDCOM file is encrypted on your device before it ever reaches our servers. We store it, but we cannot read it."*

### Supabase Schema (core tables)
- `users` — auth, subscription status, trial dates
- `trees` — per-user tree metadata, GEDCOM blob reference
- `individuals` — parsed individual records (indexed for query performance)
- `events` — birth, death, residence, burial events with normalized dates and places
- `places` — canonical place index with lat/lng, deduped across the tree
- `families` — family unit records
- `enrichment_cache` — AI and API response cache keyed by (individual_id, enrichment_type)
- `research_briefs` — user research queue, status, generated brief content, distribution log
- `sources` / `citations` — the GEDCOM's evidence layer: source bibliography plus per-fact citations (page, record-text excerpt, URL, Ancestry _APID)

### Living Person Rules
- No death date + birth year > 1920 = flagged as likely living
- Living persons: excluded from all AI enrichment queries
- Living persons: excluded from all cousin discovery matching (V3)
- Living persons: never included in shareable discovery cards
- Living persons: stored with additional encryption layer

### API Integrations

**V1 — ship with these:**
| API | Purpose | Cost model |
|---|---|---|
| OpenStreetMap / Nominatim | Place geocoding and normalization | Free |
| Wikidata | Structured historical event data for AI context | Free |
| Chronicling America (Library of Congress) | Historical newspaper enrichment | Free |
| BillionGraves | Cemetery GPS matching | TBD — outreach needed |

**V2 — add these:**
| API | Purpose |
|---|---|
| FamilySearch read API | Research gap suggestions, research brief sourcing |
| Geonames | Historical place name resolution |
| Meteostat | Historical weather for ancestor biographical context |

**Never build on:**
- Ancestry API (conflict of interest, terms risk)
- MyHeritage API (emerging competitor)
- Find A Grave (owned by Ancestry)

---

## Competitive Landscape

| Product | Platform | Threat level | Gap |
|---|---|---|---|
| FTAnalyzer | Windows/Mac desktop | Closest feature competitor | No mobile, no AI, no social, utilitarian UI |
| Forebears | iOS | Closest iOS competitor | Clunky UX, no AI, no historical context, no social |
| GedView | iOS | Viewer only | No analysis of any kind |
| MobileFamilyTree 11 | iOS/Mac | Full-featured editor | Editor focus, no intelligence layer |
| Ancestry | Web/iOS | Potential acquirer | Tree-building focus, stagnant UX |
| MyHeritage | Web/iOS | Emerging threat | Building AI layer, owns Geni |
| Geni | Web | Validates cousin discovery concept | Legacy UX, no mobile-first execution |

**The gap:** No iOS app combines GEDCOM import + temporal/geographic intelligence + AI enrichment + beautiful UX + social discovery + research brief generation. Witness owns that gap at launch.

---

## Acquisition Thesis

Primary targets: **Ancestry.com** and **FamilySearch**

Ancestry acquires complementary assets that extend utility for existing subscribers without threatening their core DNA/records business. An app that makes exported GEDCOM data dramatically more useful — and drives users back to Ancestry to fill gaps — is a complementary asset, not a competitive threat.

FamilySearch (LDS Church, non-profit) actively invests in tools that make family history more accessible. The cousin discovery network (V3) aligns directly with their mission.

**What makes Witness acquisition-attractive:**
1. Demonstrated engagement patterns Ancestry can't build internally
2. Normalized place/event intelligence layer (the geocoding problem they've never solved elegantly)
3. Distribution among 35–50 year olds inheriting family history from parents
4. A tree-based cousin discovery network at scale (V3) — something they'd rather buy than compete with
5. Research Brief Generator — structured AI research output that drives users back to Ancestry with better questions

Build for standalone success. Let acquisition interest find you.

---

## Build Plan

### Phase 1 — Foundation (Weeks 1–4) ✅ COMPLETE
GEDCOM parser, data model, Supabase schema, auth, place normalization pipeline.  
*Milestone achieved: 5,495 individuals indexed, 31 tests passing, schema live.*

### Phase 2 — Core Query Engine (Weeks 5–8)
Temporal queries, geographic queries, structural analysis, curated historical event library.  
*Milestone: "Who was alive during King Philip's War?" returns accurate results in under 2 seconds.*

### Phase 3 — AI Enrichment Layer (Weeks 9–13)
Historical context generation, Wikidata + Chronicling America integration, ancestor biography, shareable discovery cards, Research Brief Generator.  
*Milestone: Tap any ancestor, read an AI-generated biography. Generate and share a research brief.*

### Phase 4 — Map + Field Features (Weeks 14–17) ✅ mostly complete
Ancestor map, cemetery GPS, "I'm Here" mode, proactive location notifications, iPad adaptive layouts.  
*Milestone: Stand in a cemetery, open Witness, see matched ancestors within 500 meters.* ✅ met. BillionGraves and proactive location notifications remain open (see Build Status).

### Phase 5 — Notifications + Polish (Weeks 18–21) ✅ substantially complete
Weekly digest notifications, Annual Wrapped, onboarding flow, App Store assets, TestFlight beta.  
*Milestone: TestFlight live. Family + 20 outside beta testers on real GEDCOMs.* ✅ TestFlight live (build 5, onboarding + hard paywall shipped). Beyond original scope: a full web app also launched in this window (Broadsheet redesign, Web Billing, MapLibre map), plus Tree Health, NARA document matching, and the Family Stage/Register navigation rework. Annual Wrapped still open; outside beta testers not yet recruited.

### Phase 6 — Launch (Weeks 22–24)
USPTO filing, domain secured, marketing site, community seeding, press outreach, App Store submission.  
*Milestone: Witness live on the App Store. Week 1 target: 200 downloads, 50 trial conversions.* Domain (witnesslives.com) live and already serving the web app; App Store submission still open.

---

Unscheduled ideas live in [docs/IDEAS.md](docs/IDEAS.md).

## V2 Roadmap (Post-Launch)

- Natural language querying ("Who in my family would have known each other?")
- FamilySearch read API integration for research brief sourcing
- Family sharing / invite model
- Family plan pricing ($34.99/year, up to 5 accounts)
- Meteostat historical weather enrichment
- Inheritance Transfer feature

*Web browser version shipped ahead of schedule in Phase 5 (July 2026) — see Platform and Build Status above.*

## V3 Roadmap

- Cousin discovery network (opt-in, dead ancestors only, probabilistic matching)
- Community Research Briefs — share open brick walls with cousin network
- Photo and document intelligence (handwritten record transcription, gravestone OCR)
- AI-powered relationship path narration for cousin matches
- Suggested cousin outreach messages
- Family Street View — spatial navigation through the family tree

---

## Name + Brand

**App name:** Witness — Family History Intelligence  
**Tagline:** Witnesses to History  
**Domain:** witnesslives.com  
**Trademark:** Intent to Use filing in USPTO Classes 9 and 42 (file before launch)  
**Bundle ID:** com.witnesslives.witness  
**App Store category:** Reference (primary), Lifestyle (secondary)  
**Icon direction:** Timeless, warm, dignified. Not a literal eye motif. Historical document aesthetic — wax seal, compass, hourglass — or strong typographic treatment in muted amber or deep teal.

**Hero image:** Oil painting of a translucent contemporary man (silver-haired, dark jacket, viewed from behind) standing in lamplight among his mid-1800s New England ancestors, who are unaware of his presence. Painterly brushwork, amber and umber tones. Available in /assets/hero.png.

**Color system:**
- Deep ink: #1C1917 (primary background)
- Parchment: #F7F3EE (content surfaces)
- Amber: #B45309 (primary accent — Colonial New England lens)
- Acadian navy: #1E3A5F (Acadian lens)
- Acadian gold: #D97706 (Acadian lens accent)
- Moss: #16A34A (field/GPS features)
- Plum: #6D3FA0 (ancestor encounter / biography features)
- Dawn blue: #2563EB (notification / return visit features)
- Burgundy: #881337 (inheritance / legacy features)

---

## UI Reference Documents

The following documents in /docs/ provide scene-by-scene UI guidance for each core user story. These should be referenced when building each feature area.

| Document | Story | Key screens |
|---|---|---|
| USER_STORY_1.html | The First Revelation | Home post-import, query selection, results reveal, ancestor detail, share card, next query |
| USER_STORY_2.html | The Identity Lens | Branch detection prompt, lens selector, Acadian home view, Grand Dérangement results, biography, share |
| USER_STORY_3.html | The Field Moment | Lock screen notification, I'm Here map, cemetery detail, gravestone scan, town view, share |
| USER_STORY_4.html | The Ancestor Encounter | Ancestor browse, portrait view, biography, timeline, constellation, recognition |
| USER_STORY_5.html | The Return Visit | Morning notification, weekly digest, new data found, re-import diff, annual Wrapped, habit home screen |
| USER_STORY_6.html | The Inheritance | Settings/account, legacy summary, letter composer, handoff confirmation, receiving screen, new owner home |

---

## Guiding Principles

**Witness never edits.** The GEDCOM is sacred. The app reads, enriches, and surfaces — never modifies.

**Anomalies are curiosities, not errors.** Frame data inconsistencies as research invitations, not quality failures. The user spent years building their tree. Respect that.

**Research briefs are expert starting points, not conclusions.** The AI generates specific, actionable research questions. It does not guarantee outcomes. Frame every brief as a beginning, not a solution.

**Identity before data.** Witness meets users where their family identity already lives — through the branches, the surnames, the places, and the heritage that carry personal meaning.

**AI enriches, it doesn't replace.** Historical context and biographies are additive layers. The underlying data is always the source of truth.

**Privacy is a feature.** The encryption model is a marketing claim as much as a technical decision. "We can't read your family data" is differentiating in this market.

**Depth over breadth.** A smaller number of experiences done with exceptional quality are worth more than a long list of features done adequately.

**Witness deepens over time, it doesn't exhaust itself.** Every design decision should be evaluated against this principle. Does this feature create a reason to return, or does it answer a question and close?

**Built to last.** This is a portfolio asset designed to run quietly, improve incrementally, and be passed along when the time comes. Simplicity in architecture is a feature.

---

*Brief v2.0 — July 2026. Witness is an independent project by Rufus Howe.*  
*Repository: bicentenial1776-rufus/Witness*  
*witnesslives.com*
