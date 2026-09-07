# Witness — Family History Intelligence
### *Witnesses to History*

**Version:** 3.0 — Project Brief (living document)  
**Date:** August 26, 2026  
**Status:** **LIVE ON THE APP STORE** — 1.5.2 (build 12) approved and distributing as of 2026-08-24, alongside the web app at app.witnesslives.com. All six build phases complete. Current work is post-launch deepening: the storytelling layer (story arcs, whole-ancestry synthesis), the field layer (At the Stone headstone capture, offline field mode), accessibility (Large Print, the dark-mode ink world), and the Immigrant Ships library (in progress). See **August 2026 — The Chronicle Deepens** below for everything shipped since the July brief.

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
- **Web** runs its own "Broadsheet" design system (IBM Plex Mono, letterpress/newspaper aesthetic) on viewports ≥900px, gated by `useBroadsheet()` — which as of 2026-08-08 also admits the native iPad at the same width, so the reading device gets the reading layout; below that it falls back to the phone's tab bar. Same four-tab IA as the phone (Home · Tree · Explore · Map — Nearby folded into Map as its Near me mode, 2026-08-08), billing via RevenueCat Web Billing (Stripe checkout in-page) instead of Apple IAP, browser geolocation instead of device GPS for Near me, and an email digest (Resend) standing in for local push where native notifications aren't available.
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

> **Superseded 2026-08-04.** This section is replaced entirely by `docs/Street_view_demos/FSV_PROJECT_BRIEF_2026-08-04.md` (Greg, rev. 3). The silhouette figures, back-door exits, and house-scene structure described below did not survive; the product is now one continuous walkable field with embedded chapters, per the canonical demo `docs/Street_view_demos/08.02.2026 demo.html`. Kept for history only.

- First-person spatial navigation through the family tree, in a full 3D environment (not isometric or fly-over) — chosen for immersion and emotional resonance, drawing on theatrical staging and Disney-park design language
- Each family unit rendered as a navigable house interior — period-accurate architecture, candlelit
- Figures sized proportionally to age at current date (time slider)
- Silhouette figures with period clothing; photos populate faces where available — **and as of 2026-09-05 the photos exist**: the media pipeline (see *Family Photographs from the Tree File*) puts the family's own portraits, group photographs, house and headstone pictures, and record images in a private per-tree bucket, linked to the person, fact, or citation they belong to. These are the walkable world's assets-in-waiting: a portrait on the face of the figure at the door, the family group photo on the parlour wall, the house photograph as the house, the census page on the desk. Nothing needs re-collecting; the world only has to ask the tree for what it already holds.
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
- Four-tab IA (amended 2026-08-08 from the 2026-07-26 five-tab layout; originally Home/Explore/Map/Research/You): **Home · Tree · Explore · Map** — Research folded into Tree, Nearby folded into Map as its Near me mode. The freed fifth slot is deliberately empty; Street View is its strongest claimant
- **Family Stage** — a household rendered as a lifeline (a length of time, not a static chart), with a set-switcher for people with multiple marriages, honest "?" for uncertain data
- **Register** — table-of-contents navigation by time, name, and place, without ever drawing the full tree
- Both ship identically on phone and web

### The Issue & the Findings Ledger (the app's spine — 2026-08-07/08)
- **Home is a weekly edition**: one issue per ISO week, identical on every device (deterministic picks, no server). Each feature is a desk that files ONE piece — the digest's lead, a single Tree Check curiosity (the open count demoted to a footnote), the Archives' waiting count, one crossing or migration from the pattern engines. Rationing is the point: one invites where 443 oppress. A thin week prints fewer pieces; the first week says so honestly
- **Unified findings plumbing** (`@witness/core/findings` + a Postgres `findings` table): every feature emits the same typed Finding; printed pieces persist as back issues and survive GEDCOM Refresh via the carry-forward planner (per-source id rewriting; stranded stories named in the cost warning, never guessed at)
- **The issue trail**: the Portrait carries a "NO. 32 · NEXT: THE PATTERN ›" band while the reader is inside the edition — the road back that back-button archaeology used to be
- Full diagnosis and decisions in `docs/cohesion-design-brief.md`; the before/after architecture drawings in `docs/architecture/`

### Orientation Instruments (never a tree diagram)
- The Portrait answers "where am I" with one-dimensional instruments instead of a 2-D chart: the **descent path** (the relationship lede opens the person-by-person chain), the **compass** (`gen 7 · father's side` in the identity span, direct line only), and the **running head** (*House of Josiah Howe & Mary Field · third of eight children*). The discipline: anything that wants to fan out in two dimensions is a worse Ancestry
- The Portrait's onward doors: their place, their household on the Stage (`stageKeyForPerson` resolves a spouse to their household), their Tree Check findings, the descent chain, era queries — the universal destination is a junction now, not a terminus

### The Person View — "The Portrait"
- The ancestor detail screen (`ancestor/[id]`, the universal destination every tap and search routes to) rebuilt to **lead with the family**: a serif name headline, a mono span (sex-inked word · years · birthplace), the relationship as a one-line serif lede, then a register of **Parents / Brothers & sisters / Marriage + children** — every name tappable onward, the person themselves highlighted and shown in true birth order among their siblings
- Answers the plain relational questions a tree diagram is usually drawn for — *"does Patrick have siblings?"* — in one screen, without ever rendering a tree (the opinionated move over the me-too tree diagram)
- **Story** and **Their World** (AI historical context) open as inline accordions in place — the register below simply shifts down, nothing navigates away; Research left this card entirely (a person can't tell whether a brief needs generating — that belongs to Tree Health)
- Theme-aware sex-inks (men ink, women amber, unrecorded muted) so it reads in dark mode; collapses this tree's duplicate person/family records so a parent never shows twice
- Reached by **name or place search** — Explore's people search now matches a place ("Worcester" → everyone with an event there), not only names, closing the loop from a search to a person's siblings and family
- The more immersive reimagining (meeting a family "in their house" — see *Family Street View*) is parked for a dedicated design sprint; the Portrait is the shipped, everyday person view

---

## August 2026 — The Chronicle Deepens (shipped since the July brief)

### App Store Launch
Witness 1.5.2 (build 12) is **live on the App Store** as of August 24, 2026, after working through a review rejection cycle. The App Store build carries everything below through the Large Print work; At the Stone and the newest story-arc layers ride the next binary.

### Story Arcs — "Today's Line" (the Home lead)
- Every day, Home leads with one **founder-to-reader descent narrative**: a deep line-founder is chosen by daily rotation, and the arc walks the bloodline down from them to *you*, generation by generation — record facts assembled server-side, connective prose written by **claude-opus-5**, living family members never named in prompts
- Each generation carries lifespan bars (the reader in amber), a DETAILS fold with the record and relation, and a **"Their world, further"** layer: era facts grounded strictly in fetched Wikipedia year articles, a period newspaper page from the person's own town and state (Chronicling America), a period photograph of their town from their own years (DPLA), and a public-domain era recording where the years allow (1900–1925 Victor digitizations)
- Arcs are cached per founder and **retold when the record moves** — the cache remembers the home person, tree size, and ancestor count, and drift in any of the three regenerates the line. Reads are drained and the descent is checked: a chain that doesn't reach the reader is refused, never told short (v6, 2026-08-26)
- Nightly cron pre-warms today's and tomorrow's arcs so the first reader never waits

### Whole-Ancestry Synthesis (Explore)
- A 1–2 page essay over **all** direct ancestors' facts — origins, migrations, the shape of the whole inheritance — cached per tree and regenerated as the tree grows. The companion piece to the daily arc: the arc is one thread, the synthesis is the cloth

### At the Stone — Headstone Capture (phases 1–3)
- Point the camera at a headstone in the field: a vision model **reads the inscription**, kin-first matching runs it against the tree, and the stone becomes a record — verdicts (this is her / not her), leads, and corrections, in the reader's hands
- The stone can **change the tree**: ADD-person and RECORD-marriage mutations with a walk-back, the first supervised write path in a product whose founding rule is "Witness never edits" — the user is the editor; Witness is the scribe. Proven live: a weathered "Jemima" resolved to the tree's Jemenice
- Stones know each other — captures accumulate into a cemetery record

### Relationship Taxonomy & KinReveal
- Every relationship label in the app now flows through a **four-tier taxonomy** (direct line / blood kin / by marriage / community), and KinReveal renders category-first with tap-to-reveal precision — "blood kin" first, "second cousin twice removed" on request

### Offline Field Mode (v1)
- A **field copy** of the tree lives on the device: Explore, the Portrait, and the relationship graph answer with no signal — built for the cemetery, the county archive, the back road where the ancestors actually are

### Large Print & the Ink World (accessibility for the real audience)
- A 12px floor and darkened tokens across the app; persistent tab bar; **dark mode rebuilt as a letterpress "ink world"** rather than an inverted theme; accessibility roles and labels throughout. The target user is 55+; this is product strategy, not compliance

### Family Context on the Portrait
- Relatives woven into every Portrait, a **pedigree chart in Views**, and a general-knowledge history tier with an explicit decline log — the model declines rather than guesses, and the declines are recorded

### Reader-Driven Round Trips
- A professional genealogist's review (Katie) became a fix arc: every bug-tier finding shipped, and the corrections punch list closed 2026-08-24
- Beta reader requests shipped as features: **twin rendering**, **personal notes on ancestors**, and **starred people** — all web-live
- A hidden, annotated-screenshot **Field Guide** at witnesslives.com/guide documents every screen

### One Generation at a Time, and Relatives by Kind (shipped 2026-09-06)
A beta reader wrote: "When I see that everyone has 128 fifth great-grandparents I know I am too deep… If I could see just 3 generations back that would be manageable. Or one generation at a time. Show me my first cousins. Show me my mom's first cousins." Two doors on the Tree tab answer her, both built on the relationship rows the app already computes. **One generation at a time** walks the direct line outward — parents, grandparents, the greats — each a page split by the father's and mother's side, with how many of the generation's slots the record has filled ("8 of 8 known", "34 of 32" where pedigree collapse doubles a line). **Relatives by kind** shelves every labelled relationship closest first with a count — first cousins proper on their own shelf, the removed just after, a spouse's people under the spouse — and opens each as a list with the standard filter bar. Both carry a **"Seen from"** band: choose anyone in the tree and every relationship re-reads from them, computed on the device in a tenth of a second and never written (the Portrait's session-only lens, now shared). "My mother's first cousins" is her name, then First cousins. Same day: every list in the app gained the same relationship symbol after each name, and every list over eight rows a collapsed filter (search, relationship, stacked sort keys).

### Family Photographs from the Tree File (shipped 2026-09-05)
The GEDCOM has always named the family's photographs; Witness now takes them. Every import records what the file says about media — Family Tree Maker's `_PHOTO` portrait pointer, Ancestry's `_PRIM` flag, photos on the person, on a fact, behind a citation, on the family — as `media` rows and an attachment graph (`media_links`), with bytes kept in a private per-tree bucket. The Portrait carries a **"Photos from your tree file"** strip, portrait first, and a tap opens the original full-screen on black with the GEDCOM's title as caption (pinch to zoom on iOS). Family-sharing companions see the photos through the same read grant as everything else on the tree; deleting a tree takes its photos with it.

**The rule that keeps this honest:** a standard GEDCOM shows nothing new. Ancestry's export names 1,832 photos with empty file lines; the rows land as *pending* and the strip stays hidden until bytes exist. Nothing changes on any screen for a user whose file carries no media. Only a file exported **with** its media folder — Family Tree Maker's "Include media files" — can light the strip.

**How the bytes arrive today:** a desktop overlay (`npm run overlay:ftm`), run on the owner's Mac against the FTM export and its Media folder. It attaches the photos to the tree already in Witness rather than re-importing — a re-import would orphan verdicts, notes, stones, and family seats — by matching people on name and years in strict-to-loose tiers that refuse ambiguity rather than guess. First run on the Howe/Field tree: 5,189 of 5,611 people matched, 848 people with attachments, 552 portraits, ~1,500 gallery photos. Design brief: `docs/gedcom-media-design-brief.md`.

**Where else they go:** these are also Family Street View's assets — faces on figures, group photographs on parlour walls, the house photo as the house (see the FSV concept section).

**Not yet:** the ~16,000 record images filed under citations (census pages beside their source on the Sources tab — needs event/citation matching), the 190 Find a Grave and book clippings as readable notes rather than files, resizing, and any way for a user who is not at a Mac terminal to bring photos in. That last gap is the V2 item below.

### Immigrant Ships (in progress — data layer built, product layer designed)
The newest chapter, begun 2026-08-26. See the dedicated section below.

---

## Immigrant Ships — the Crossing Library (in progress)

**The idea:** a shared, provenance-first library of ship passenger lists, matched against every user's tree. *Which of my ancestors came over on a ship — and which ship?*

**Built (2026-08-26):**
- Dataset shape, CSV importer, and a **soundex + year-plausibility matcher** in core (Howe/How/Howes bucket together; years must agree or at least not contradict; born-after-arrival and dead-before-arrival pairs dropped)
- Candidates graded **strong / probable / weak**, each carrying plain-language reasons — *"birth 1599 and 1599 agree within 0; alive in 1620, when the Mayflower arrived"*
- Six voyages imported from public-domain transcriptions (Mayflower, Fortune, Anne, Little James, Jamestown 1607, Winthrop Fleet), 285 passengers, every row citing its source — no passenger fact is authored by Witness
- First live run against the founder's 5,495-person tree: **23 candidates, 15 strong**, including John Alden, John Howland, Richard Warren, Francis Cooke, and the family clusters history says followed on the Anne

**The library grows for every ancestor profile, not one tree:** Banks' *Planters of the Commonwealth* (~3,500 Great Migration passengers, 1620–1640) and Hotten's London port registers (~10,000 names, 1600–1700) are public domain and next to import; then the Pennsylvania German oath lists (~30,000, 1727–1808), Quaker fleets, Scots-Irish ships, Huguenot arrivals. Post-1820 ports (Castle Garden, Ellis Island) are searchable but not bulk-available — Witness links out rather than pretending to hold them.

**Product integration (designed, not yet implemented):**
1. **Findings first** — new strong candidates arrive as pieces in the weekly edition, per the cohesion spine. No new shelf.
2. **The Crossing card on the Portrait** — passenger row, voyage, reasons, and a confirm / not-them verdict (the At the Stone pattern). Confirming writes a real immigration event citing the transcription; Witness never auto-writes.
3. **The ship badge — the first emoji in Witness.** A confirmed crossing earns the person a small ship glyph with the vessel's name — **⛵ *Anne*, 1623** — on their Portrait and share cards. In a product this typographically austere, the first emoji is an event: it's earned, not decorative, and it's the collectible delight that makes cousins ask "does our line have a ship?"
4. **Story arcs gain the crossing** — a confirmed voyage becomes a fact line in the founder's generation ("sailed on the Anne, 1623") and the ship a natural "Their World" card
5. **The Map draws the first leg** — departure port → arrival port → the inland migration paths it already knows
6. **Tree Health closes the loop** — "N possible passengers are blocked by missing dates": weak candidates become a research queue (the live tree's Priscilla Mullins is one Ancestry lookup from strong)
7. **Explore ship browser** (last) — voyages with your candidate counts, each ship a page with its history and your people

Matching is deterministic — no AI tokens — so candidates can be free-tier visible with confirm-and-write as the premium gesture. Every surface carries the caution the data demands: *a Mayflower name is the beginning of a question, not a descent.*

---

## Historical Record Registers (framework built 2026-09-02; first registers pending)

**The idea:** many public-domain record sets share one shape — a seed or a
deep-link, an exposure heuristic over GEDCOM facts, a user-confirmed link,
then narrative, map, and research queue. Build the shape once; add each
record set as configuration plus data. Full spec:
`docs/witness-historical-record-registers-package.md`; working reference:
`docs/historical-record-registers.md`.

**Three variants, one frame:** A — curated person table matched to the tree
(Acadian Deportation, Loyalists, Filles du Roi; the shape the Crossing
Library proved); B — entity table whose dated events attach to a person
(Civil War regiments); C — deep-link out with a structured save-back (BLM
land patents, the LAC sets). The shipped one-offs (Crossing, NARA, Find a
Grave) stay as they are — the framework copies their patterns.

**Built (2026-09-02):** the `registers` catalog + `register_records` +
`register_record_events` + `person_register_links` tables (global PD
reference data, per-user verdicts, snapshot cards); the config-driven
exposure scorer and Variant A matcher in core; deep-link templating;
provenance-labeled narrative blocks; map points (person vs entity); the
generic Portrait card ("In the record books") with verdicts, coverage
caveats, and the "?" explainer; seed + match/harness CLIs; findings-ledger
emission for strong candidates; and refresh carry-forward for decided links
from day one.

**Invariants:** public-domain sources only, per-row citations, copyrighted
compilations as finding aids; candidates until a human confirms
(`parsed_from_gedcom` the lone exception); silence over guessing; verdicts
survive GEDCOM refresh. **Build order (locked):** Acadian Deportation →
Civil War → GLO patents → Loyalists → config-only additions (CEF WWI, Home
Children, Grosse-Île, Filles du Roi). Every register's deep link is verified
against the live target before it ships.

### Acadian Deportation Records (register `acadian-deportation` — Phase 0, decisions locked)

The first real register (Variant A), per
`docs/witness-acadian-deportation-prompt.md` re-expressed on the framework:

1. **Provenance (amended 2026-09-02, Rufus's call after the source
   survey).** The curated rows hold only facts attributable to public-domain
   primary records of 1755–1764. The Grand-Pré roll was never printed in a
   pre-copyright edition (the NSHS *Collections* print of Winslow's journal
   carries the narrative and letters, not the name roll), so the register
   takes the **facts-not-expression** posture already shipped for the Ark &
   Dove: bare facts of the PD 1755 record (name, village, household counts)
   are taken from accessible reproductions, never their annotations or
   identifications, and every row cites BOTH the original record (Winslow's
   returns, Oct 1755, Massachusetts Historical Society manuscript) and the
   finding aid used to reach it. acadian-home.org, acadian.org, WikiTree's
   Acadians Project, and every modern compilation (Acadians in Gray
   included) remain finding aids and deep-link targets; Stephen White's
   *Dictionnaire* is never ingested.
2. **Scope for v1, amended by the source survey.** Grand-Pré (Winslow's
   lists, Sept–Oct 1755) seeds fully — the list survives with heads of
   family, family sizes, and home villages. For the seven Chignectou ships
   to South Carolina/Georgia, named EMBARKATION returns largely do not
   survive; person rows are seeded only where a PD primary record (South
   Carolina council/assembly returns) actually names someone, and otherwise
   the ships enter as voyage-context only. Pisiquid stays out — no reliable
   list exists. Widening is a data change, per the framework.
3. **Match semantics.** Candidates only; the user confirms on the Portrait
   card ("curiosities, not verdicts"). No auto-linking.
4. **Narrative.** Confirmed links feed the sourced tier as "From Deportation
   records (Grand-Pré, 1755)" / "(Chignectou–Carolinas, 1755)". Candidates
   never appear in prose. Aggregate counts may join Tree Health as a
   research-queue check; per-candidate verdicts stay on the Portrait, per
   the framework's correction of the original prompt.
5. **Names.** A deterministic `acadianNames` normalizer (dit-names, spelling
   variants, French/English given-name equivalents) backed by a versioned
   variant data file in `data/registers/acadian-deportation/` — a first
   pass, expected to be tuned. The Acadian surname roster derives from the
   PD censuses (1671–1752), not from any secondary site.
6. **Match signals beyond the framework's core** (the register's plugin, the
   framework's first): origin-settlement consistency against GEDCOM
   birthplace, destination-colony consistency against later events, and
   household-role age plausibility — each an explicit, plain-words reason.

### Civil War Enrichment (register `cw-regiments` — candidates flowing, confirm built 2026-09-06)

**Status 2026-09-06.** Variant B candidates now flow: exposure is the candidate (one link per exposed man, no record attached), boosted by a **citation signal** — a source the tree itself cites whose title says "Civil War" (pension index, soldier records, draft registration) carries a man over the threshold on its own and the card names the source. The Howe/Field tree: 115 candidates, 27 with such a citation. The confirm is the **regiment picker** ("Add his regiment"): search the 1,578 Dyer units by any words, optional company and rank, attach — which writes a military event "Served in the … — from regimental records (Dyer's Compendium, 1908)". The Dyer seed got an OCR-repair pass (years inside the war's decade, month misreads, shredded branch words; 26 garbled duplicates retired). Still to do: engagement extraction (the map layer), NPS battles and Confederate units, the narrative sample for a confirmed soldier.


Variant B, per `docs/witness-civil-war-prompt.md` on the framework:
**regiment-first** — 1,593 Union units from Dyer's *Compendium* (1908, PD)
seeded as entity records with verbatim service narratives; the 6.3M-name
CWSS index, state rosters, and commercial sets are never ingested.
Person-level links are **user-confirmed only** (exposure → prefilled
FamilySearch Soldiers Index search, since CWSS verified to have no
parameterized search → confirm), except a GEDCOM military event with a
parseable unit string attaches its UNIT as `parsed_from_gedcom` — this
tree has none (its military events are 1917 draft cards), so that path
awaits trees that do. `parseUnitDesignation` (versioned unit-terms file)
passes a 52-string gauntlet at 100%. Confederate coverage: NPS histories
later, silence where thin, caveat on every card. Known-thin and tracked:
engagement-event extraction (17 events on a 20-unit sample — needs its own
pass before the map integration), the Add-unit picker, NPS battles.

---

## Features Explicitly Deferred

- **Tree editing** — Witness never modifies a GEDCOM. Read-only always. *(Amended 2026-08-25 by At the Stone: the user may now make supervised, walk-backable additions — ADD person, RECORD marriage — from field evidence they verify themselves. The user is the editor; Witness is the scribe. The GEDCOM source file itself is still never touched.)*
- **Ancestry/FamilySearch write API** — not pursued. GEDCOM re-import is the sync model.
- **Cousin discovery network** — V3 feature. Opt-in, dead ancestors only.
- **Android** — deferred until iOS demonstrates product-market fit.
- **AI anomaly correction** — anomalies surfaced as curiosities, never sent back to source tree.

---

## Technical Architecture

### Stack
- **Frontend:** React Native / Expo (universal — iPhone, iPad, and web, all shipped)
- **Backend:** Supabase (Postgres + Storage + Auth + Real-time), pg_cron workers for geocoding, NARA matching, and digest generation
- **AI:** Anthropic Claude API — claude-sonnet-4-6 for enrichment/biographies, **claude-opus-5** for story arcs and whole-ancestry synthesis, vision models for At the Stone headstone reading
- **Subscriptions:** RevenueCat (native IAP) + RevenueCat Web Billing via Stripe (web). Superwall retired 2026-08-14 in favor of a native narrative pre-auth flow + Apple Sign-In
- **Maps:** Apple Maps (native, via `react-native-maps` default provider) / MapLibre GL over CARTO basemaps (web)
- **Web hosting:** Vercel, deployed from `docs/preview-site` at witnesslives.com root; email digest fallback via Resend

### Build Status (July 2026 — everything after 2026-08-08 lives in **August 2026 — The Chronicle Deepens** above)
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

### Phase 6 — Launch (Weeks 22–24) ✅ COMPLETE
USPTO filing, domain secured, marketing site, community seeding, press outreach, App Store submission.  
*Milestone: Witness live on the App Store.* ✅ **Met 2026-08-24** — 1.5.2 (build 12) approved and live after one rejection cycle. witnesslives.com rebuilt around the three-pillar pitch (Storytelling / Tree Health / Immersive Insights); genealogical-society outbound campaign underway.

---

Unscheduled ideas live in [docs/IDEAS.md](docs/IDEAS.md).

## V2 Roadmap (Post-Launch)

- Natural language querying ("Who in my family would have known each other?")
- FamilySearch read API integration for research brief sourcing
- Family sharing / invite model
- Family plan pricing ($34.99/year, up to 5 accounts)
- Meteostat historical weather enrichment
- Inheritance Transfer feature
- **Photos for everyone, not just the owner at a terminal** *(decided 2026-09-05; the display side shipped, the intake side is this item)*. Two doors, either or both:
  - **"Send to Witness" desktop companion** — a small Mac/Windows app that takes a Family Tree Maker (or any) GEDCOM plus its Media folder, matches people onto the user's existing Witness tree the way the overlay does, and uploads. Grows from the overlay CLI. This is also the natural shape of a MacKiev partnership: FTM already sells companion products from its own paywall.
  - **In-app bundle import** — the app accepts a zip of `.ged` + media (the iPad Files app can make one; drag-and-drop on the web), records the media, and uploads in the background with a progress line. Same overlay-not-reimport rule; same "pending until bytes exist" honesty.
  - Behind both: resize on upload (2048 web + 400 thumb, originals kept for documents), hash dedupe across a user's trees, record images surfaced beside their citation on the Sources tab, and `.htm` clippings rendered as notes.

*Web browser version shipped ahead of schedule in Phase 5 (July 2026) — see Platform and Build Status above.*

## V3 Roadmap

- Cousin discovery network (opt-in, dead ancestors only, probabilistic matching)
- Community Research Briefs — share open brick walls with cousin network
- Photo and document intelligence (handwritten record transcription; ~~gravestone OCR~~ **shipped early as At the Stone, 2026-08-25**)
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

**Witness never edits.** The GEDCOM is sacred. The app reads, enriches, and surfaces — never modifies. Where the field hands the user evidence (At the Stone, a confirmed crossing), the *user* may write, with a walk-back, and the source file is still never touched: the user is the editor, Witness is the scribe.

**Anomalies are curiosities, not errors.** Frame data inconsistencies as research invitations, not quality failures. The user spent years building their tree. Respect that.

**Research briefs are expert starting points, not conclusions.** The AI generates specific, actionable research questions. It does not guarantee outcomes. Frame every brief as a beginning, not a solution.

**Identity before data.** Witness meets users where their family identity already lives — through the branches, the surnames, the places, and the heritage that carry personal meaning.

**AI enriches, it doesn't replace.** Historical context and biographies are additive layers. The underlying data is always the source of truth.

**Privacy is a feature.** The encryption model is a marketing claim as much as a technical decision. "We can't read your family data" is differentiating in this market.

**Depth over breadth.** A smaller number of experiences done with exceptional quality are worth more than a long list of features done adequately.

**Witness deepens over time, it doesn't exhaust itself.** Every design decision should be evaluated against this principle. Does this feature create a reason to return, or does it answer a question and close?

**Built to last.** This is a portfolio asset designed to run quietly, improve incrementally, and be passed along when the time comes. Simplicity in architecture is a feature.

---

*Brief v3.1 — September 5, 2026. Witness is an independent project by Rufus Howe.*  
*Repository: bicentenial1776-rufus/Witness*  
*witnesslives.com*
