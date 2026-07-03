# Witness — User Stories: UI Reference Guide
### *For use during screen design and development*

**Version:** 1.0  
**Date:** July 2026  
**Companion files:** USER_STORY_1–6.html (interactive storyboards)

---

## How to Use This Document

Each user story defines the emotional arc and UI requirements for a major feature area. During development, the relevant story should be open alongside the code. The storyboard HTML files are the visual reference; this document is the decision layer — what each screen must do and why.

The stories are ordered by build priority, not narrative sequence. Story 1 (The First Revelation) builds first because it defines the core onboarding experience. Story 6 (The Inheritance) builds last because it depends on everything else existing.

---

## The Six Core Stories

| # | Story | Emotional arc | Primary feature area | Build phase |
|---|---|---|---|---|
| 1 | The First Revelation | Skeptic → Believer | Query engine, discovery cards | Phase 2 |
| 2 | The Identity Lens | Recognition → Depth | Branch focus, Acadian/heritage view | Phase 3 |
| 3 | The Field Moment | Surprise → Presence | I'm Here, cemetery GPS, town view | Phase 4 |
| 4 | The Ancestor Encounter | Curiosity → Connection | Biography, timeline, constellation, recognition | Phase 3 |
| 5 | The Return Visit | Habit formation → Ritual | Notifications, re-import, annual Wrapped | Phase 5 |
| 6 | The Inheritance | Legacy → Continuity | Inheritance transfer, letter, receiving | V2 |

---

## Story 1 — The First Revelation

**The user:** Just imported their GEDCOM. 5,495 people. No idea what to do next.  
**The job:** Convert a skeptic into a believer in a single session.  
**The measure:** Does the user share something, call someone, or immediately run another query?

### Scene 1 — The Invitation
**Screen:** Home post-import  
**What it must do:** Surface three curated query cards immediately after import. The featured card is chosen by AI based on what's in the tree — not random. A tree heavy with Colonial New England ancestry gets King Philip's War. The import success banner is understated: confirm the work is done, don't celebrate it. The celebration comes in a moment.  
**Critical detail:** The featured query card must be AI-selected at import time. This is the product's first promise to the user — that it already knows something about their specific tree.

### Scene 2 — The Search
**Screen:** Query computing state  
**What it must do:** The loading state is a feature, not a problem to hide. Show a counter of individuals being evaluated, climbing visibly. Show the historical event context card during the wait. The user should arrive at the results understanding why they matter.  
**Critical detail:** Never show a generic spinner. The counting animation creates investment in the result.

### Scene 3 — The Revelation
**Screen:** Query results  
**What it must do:** Lead with the large number. "1,046" before any list. Then the framing sentence. Then the AI-surfaced most compelling individual. Then the scrollable list. A subtle share prompt at the bottom — available, not pushed.  
**Critical detail:** The number is the headline. Don't bury it in a list.

### Scene 4 — The Encounter
**Screen:** Ancestor detail (from results)  
**What it must do:** Show a generated biography paragraph with historical context. Surface context pills (tappable: King Philip's War, Colonial Rhode Island). Show family connections below. The experience should reward dwelling — not feel like a data sheet.  
**Critical detail:** Biography is generated once and cached on first view. Subsequent views are instant.

### Scene 5 — The Share
**Screen:** Discovery card generator  
**What it must do:** Generate a beautiful branded card. The Witness identity appears as attribution, not watermark. iOS share sheet with iMessage as primary. Card should feel like something the user is proud to send — not like forwarding a screenshot.  
**Critical detail:** Card carries the active lens visual identity. Colonial queries get the amber/parchment palette.

### Scene 6 — The Pull
**Screen:** Post-share home  
**What it must do:** Two or three new query suggestions that are contextually generated from what the user just discovered — not a static list. If they just explored Rhode Island in 1675, the next suggestions should build on that geography and era. Make the transition from "one query" to "one more query" feel natural.  
**Critical detail:** Contextual next queries are the flywheel. This is what turns a one-time visitor into a user.

---

## Story 2 — The Identity Lens

**The user:** Ruth. Identifies as Acadian before she knows anything about Witness.  
**The job:** Honor the identity the user already carries. Deepen it with specific historical and biographical context.  
**The measure:** Does the user designate a branch focus within their first three sessions? Do they return to it?

### Scene 1 — The Prompt
**Screen:** Home with branch detection banner  
**What it must do:** Witness has already analyzed the tree at import and identified heritage clusters. The Acadian prompt surfaces because the tree contains Boudreault, LeBlanc, Thibodeau, Melanson surnames and Nova Scotia place names. The banner is gentle — can be dismissed. The language is: "Your tree contains an Acadian branch." Not "We found data."  
**Critical detail:** Branch detection is automatic. The prompt appears only when Witness has genuine confidence in the identification.

### Scene 2 — The Lens Selector
**Screen:** Branch lens selection  
**What it must do:** Show distinct heritage threads identified in the tree — not as data categories but as named family identities. Branch size is never presented as a value judgment. 43 Acadian ancestors are treated with the same dignity as 2,847 Colonial New England ancestors.  
**Critical detail:** This screen should feel like choosing a chapter of a book, not filtering a dataset.

### Scene 3 — The Acadian View
**Screen:** Lens-specific home  
**What it must do:** The entire home screen reorients. Color palette shifts to Acadian navy and gold. The Acadian star motif appears. Statistics are specific to the branch. Suggested queries are curated for Acadian heritage. Places panel shows specific Acadian geography — Grand-Pré, Pisiguit, Port-Royal.  
**Critical detail:** The visual identity of the lens matters enormously. This must feel like a different room in the same house — coherent with Witness overall but distinctly Acadian.

### Scene 4 — The Dérangement
**Screen:** Traumatic historical event results  
**What it must do:** Lead with context, not the number. The Grand Dérangement requires that the human catastrophe lands before names appear. Show individual fates where records allow: "Deported to Maryland," "Died in transit," "Survived to Quebec." This is different from a celebratory discovery — the UI should be quieter, more reverential.  
**Critical detail:** The tone of the product must adapt to the weight of what it's showing. The Grand Dérangement is not a "wow" moment — it's a moment of recognition and grief.

### Scene 5 — The Biography
**Screen:** Ancestor detail — Acadian  
**What it must do:** Show the exile path visualization — a chain of known places (Grand-Pré → Maryland → Quebec → Ruth) with implied gaps between them. This is unique to the Acadian lens. The gaps between documented places are as important as the places themselves.  
**Critical detail:** The exile path is a lens-specific feature. Build it as an extension point — other lenses (Irish famine migration, westward expansion) can have their own equivalent.

### Scene 6 — The Share
**Screen:** Acadian discovery card  
**What it must do:** The card carries the Acadian visual identity — deep navy, the star motif, the French place name as anchor. The final line: "My family was there." Not triumphant. Claiming belonging.  
**Critical detail:** "My family was there" is the product at its most personal. The copy on share cards should always be written in first person, from the user's voice, not the product's.

---

## Story 3 — The Field Moment

**The user:** Driving through southeastern Massachusetts on an unrelated errand.  
**The job:** Make the past present in a specific physical location.  
**The measure:** Does the user photograph something, add a note, or share the moment?

### Scene 1 — The Notification
**Screen:** Lock screen  
**What it must do:** Arrive as a gift, not an alert. Tone of a thoughtful friend who remembered something — not a marketing message. The historical detail in the copy must be specific: "The Packard and Stetson families were here for four generations" not "ancestors lived here." Location trigger uses significant-location-change monitoring, not continuous GPS.  
**Critical detail:** The notification copy is the product's voice at its most distilled. It is AI-generated fresh for each location event — never canned.

### Scene 2 — I'm Here Mode
**Screen:** GPS-active map  
**What it must do:** Blue dot for user, green pins for ancestor locations, a glowing cemetery outline where BillionGraves has matches. Ancestor list below map, ordered by distance from current location. Distance shown in human terms: "0.4 miles" not coordinates. Mode indicator shows "I'm Here — Active" with a pulsing dot.  
**Critical detail:** The map in I'm Here mode is an ancestral overlay, not a full mapping experience. Keep it focused and sparse.

### Scene 3 — The Cemetery
**Screen:** Cemetery detail  
**What it must do:** Show confirmed matches (solid border) and probable matches (dashed border) distinctly. Never present a probable match as confirmed. Relationship path ("your 6th great-grandfather") visible on the cemetery card without requiring navigation to ancestor detail — this is a field experience, every tap costs presence.  
**Critical detail:** The confirmed/probable distinction is a data integrity commitment. Compromise it once and the product loses trust.

### Scene 4 — The Gravestone
**Screen:** Camera scan mode  
**What it must do:** Guided frame overlay, minimal chrome. OCR reads inscription, matches against GEDCOM. Confirmation is immediate. Research gap flag appears when inscription contains information not in the GEDCOM ("inscription says 9 children, tree has 6"). Contribute photo to BillionGraves offered as opt-in, not required.  
**Critical detail:** The research gap flag turns a cemetery visit into a research session. This is the feature that makes users re-import their GEDCOM.

### Scene 5 — The Town
**Screen:** Town view  
**What it must do:** Ancestors organized by era tabs (1700s, 1800s, 1900s). Family clusters shown together. Research gap surfaces with a specific suggested archive — not just "there's a gap" but "Plymouth County Registry of Deeds may have answers."  
**Critical detail:** Research gaps in the town view connect directly to the Research Brief feature. A tap on a gap should offer to generate a brief.

### Scene 6 — The Share
**Screen:** Field moment share card  
**What it must do:** Include the photo the user took. Location as header. The discovery in the user's own words (optional caption). Witness wordmark as attribution. Most personal card of all — and therefore most likely to convert the recipient.  
**Critical detail:** The field share card is documentary, not designed. The user's photo is the hero.

---

## Story 4 — The Ancestor Encounter

**The user:** Browsing the ancestor list. A name stops them.  
**The job:** Transform a record into a person.  
**The measure:** Does the user read to the end of the biography? Do they share it? Do they come back?

### Scene 1 — The Browse
**Screen:** Ancestor list with "remarkable" indicator  
**What it must do:** The "remarkable life" tag appears on ~3–5% of ancestors — those with unusual biographical density, historical significance, or narrative richness. It is a promise: tapping this person will be worth your time. The product must deliver on that promise every single time the tag appears.  
**Critical detail:** If the remarkable tag appears too often, it loses meaning. Gate it tightly. The AI selects based on: historical event overlap, number of documented events, connection to notable figures, narrative coherence of available data.

### Scene 2 — The Portrait
**Screen:** Ancestor detail header  
**What it must do:** Not a record view. A portrait. Deep background, years as typographic architecture, "lived through" event tags (tappable) in the upper right. Quick stats: years lived, children, generations ago. Biography tab pre-selected. This is the most designed screen in the product.  
**Critical detail:** The "lived through" event tags are a visual summary of the historical context biography. They let the user see the era before reading a word.

### Scene 3 — The Biography
**Screen:** Full biography  
**What it must do:** Read like a passage from a good popular history book — warm, specific, grounded in what is known, honest about what isn't. Pull quotes surface the most resonant passages. Generation badge visible throughout. Never invent — only synthesize and contextualize. When AI draws on external historical knowledge, indicate it lightly.  
**Critical detail:** The biography distinguishes between GEDCOM data and historical knowledge. Users trust the product more when it's honest about the sources of its claims.

### Scene 4 — The Timeline
**Screen:** Ancestor timeline  
**What it must do:** Personal events (plum dots), regional history (amber dots), world events (grey dots). The timeline makes the arithmetic of history emotional — users compute ages during events without being asked. Show only world events the user will recognize, in the right geography, at resonant ages.  
**Critical detail:** Editorial judgment governs which world events appear. Not everything — only what illuminates this specific life.

### Scene 5 — The Constellation
**Screen:** Family network view  
**What it must do:** Dark background. Subject ancestor at center, large. Parents above, spouse to side, children radiating outward. Node size proportional to data completeness — dim nodes for gaps. Tapping any node pivots to that person's encounter. The constellation makes incompleteness visible as an invitation, not a failure.  
**Critical detail:** This is not a replacement for a traditional family tree. It answers "who surrounded this person?" — a different question from "where does this person fit in the hierarchy?"

### Scene 6 — The Recognition
**Screen:** AI recognition prompt  
**What it must do:** Rare, honest, humble, never invented. Appears only when genuine parallels exist between the ancestor's life structure and the user's profile. Frame as an observation, not an algorithm: "Witness noticed something." Must never make personality claims that can't be supported by data.  
**Critical detail:** This is the feature that makes people cry. Design it with more care than any other screen in the product. It must earn the emotional moment it creates.

---

## Story 5 — The Return Visit

**The user:** Fourteen months in. Opening Witness on a Sunday morning because they want to.  
**The job:** Make Witness a habit, not a destination.  
**The measure:** Notification open rate. Session length from notification. Annual renewal rate.

### Scene 1 — The Morning Notification
**Screen:** Lock screen  
**What it must do:** Feel like a gift placed on a windowsill, not an alert demanding attention. The historical detail must be specific and fresh — AI-generated for this ancestor, this date, this user. Never the same copy twice. Never generic.  
**Critical detail:** The notification is the product's daily voice. It sets the tone for everything that follows. It must be excellent every time it appears, or users turn it off.

### Scene 2 — This Week in Your Family
**Screen:** Weekly digest  
**What it must do:** Three entries maximum. Selected for variety (birth, death, marriage produce a stronger combination than three births) and biographical richness. Primary entry is longer; secondary entries are shorter. The user came for one ancestor; the others are discoveries made along the way.  
**Critical detail:** Three is the maximum. More than three becomes a list to scroll through.

### Scene 3 — New Data Found
**Screen:** External data notification  
**What it must do:** Frame new external records as additive and celebratory — never alarming. "New records found" not "Your data has changed." Activity feed shows which sources contributed what, giving the user a sense of the living archive network Witness monitors on their behalf.  
**Critical detail:** This screen embodies the timeshare-in-time concept. The subscription earns itself while the user sleeps.

### Scene 4 — The Re-Import
**Screen:** Import diff  
**What it must do:** "Your tree has grown" — not "import complete." List meaningful things in human language, not data counts. Contextual query prompt appears immediately: turn maintenance back into discovery without delay.  
**Critical detail:** The re-import should feel like arriving home with something new, not submitting a file.

### Scene 5 — The Annual Wrapped
**Screen:** Annual summary  
**What it must do:** Surface in the first week of December. Consistent timing builds anticipation. Headline number gives the year a shape. Named discoveries give it a narrative. "Ancestor of the year" drawn from actual usage data. Designed to be shared. The product's single highest-leverage annual moment.  
**Critical detail:** The Annual Wrapped is Witness at its most presentational. It is the most polished screen in the product. Every pixel earns its place.

### Scene 6 — The Habit
**Screen:** Long-term user home screen  
**What it must do:** Show a small engagement indicator (candle flame, not a Duolingo owl). Recent activity panel reflects the user's actual usage patterns. Subscription renewal note is gentle and grateful: "renewed yesterday · thank you." The home screen has learned what this user cares about and reflects it back.  
**Critical detail:** The engagement indicator is warm, never coercive. The renewal acknowledgment respects the transaction rather than hiding it.

---

## Story 6 — The Inheritance

**The user:** Rufus, after years of use, ready to pass the archive to his daughter Sarah.  
**The job:** Make the generational handoff a designed, emotional product moment.  
**The measure:** Transfer completion rate. Retention of transferred accounts.

### Scene 1 — The Decision
**Screen:** Settings / account  
**What it must do:** The Inheritance Transfer option is in Settings but not hidden. Not buried like a cancellation flow — placed with intention. Tapping it asks: "Before we begin — would you like to see what you've built?" This creates a moment of reflection before any action. The app acknowledging what the user has done.  
**Critical detail:** The Inheritance Transfer must feel intentional and dignified. Never like account deletion.

### Scene 2 — The Legacy Summary
**Screen:** What you built  
**What it must do:** Not a trophy case. Show what was built AND what remains to be built — both matter equally. Unresolved items framed as open doors: "three curiosities that await investigation," not "three unresolved errors." The person receiving the inheritance gets a research agenda, not just a completed archive.  
**Critical detail:** This screen should feel like the front matter of a book being handed from one reader to the next.

### Scene 3 — The Letter
**Screen:** Letter composer  
**What it must do:** Look and feel different from every other screen — warmer, more analog, quieter. Ruled paper texture. Serif type. The sense of something being written, not typed. Gentle prompts, not required fields. Letter stored privately, displayed only to recipient on first open. Cannot be edited after transfer — it's a letter, not a document.  
**Critical detail:** The letter creates an occasion that didn't exist before. Some users will write one sentence. Some will write a page. Both are right.

### Scene 4 — The Handoff
**Screen:** Confirmation  
**What it must do:** Show what transfers in human language, not data inventory. "34 AI-generated life narratives" not "enrichment cache records." "Three years of family history" not a filename. The confirm button says "Complete the Transfer." The confirmation message says "Sarah will receive it when she opens Witness" — not "transfer complete."  
**Critical detail:** "Sarah will receive it when she opens Witness" is the product's most quiet and consequential line. Something has been given.

### Scene 5 — Received
**Screen:** Sarah's first open  
**What it must do:** The letter appears first. Before the tree. Before the statistics. Before any query prompts. Only after Sarah dismisses the letter does Witness surface what she's inherited. Sequence: letter → context → invitation to explore.  
**Critical detail:** Reversing this order makes it feel like an account setup with a note attached. In the right order, it feels like an inheritance.

### Scene 6 — Continued
**Screen:** Sarah's home screen, weeks later  
**What it must do:** The "inherited from" badge is visible but small and fading. The home screen has begun to feel like hers. A suggested query connects to unfinished work from her father: "Your father never fully explored the Fobes line after 1720. Want to continue where he left off?"  
**Critical detail:** The story doesn't end. It changes hands. The product must make that continuity feel natural and earned, not engineered.

---

## Cross-Story Design Principles

These principles apply across all six stories and should be checked against every screen decision.

**The tone adapts to the weight of the content.** The Grand Dérangement is not a "wow" moment. A cemetery visit is not the same as a query result. The Annual Wrapped is not the same as a weekly digest. The product has multiple emotional registers — make sure each screen is in the right one.

**The lens carries through everything.** When the Acadian lens is active, it shows in the palette, the query suggestions, the biography framing, the share card, the notification copy. The lens is not a filter — it's a perspective that colors the entire experience.

**Absence is an invitation.** Missing records, dim constellation nodes, gaps in the research brief — these are not failures. They are the places where the story continues. Frame them as doors, not walls.

**The share card is always first-person.** "47 of *my* ancestors were alive." "My family was there." The product never speaks for the user. The user speaks, with Witness as the source.

**Every interaction with the product should create one reason to return.** Not through compulsion — through genuine value. The next query suggestion after a discovery. The research brief after finding a gap. The re-import prompt after a brief is resolved. These are designed flywheel moments, not dark patterns.

---

## Research Brief — UI Requirements

The Research Brief is a professional feature deserving careful UI treatment. Key requirements:

**Generation trigger:** Three entry points — (1) tap "Get research brief" on any ancestor detail view, (2) tap a research gap in the town view, (3) proactive prompt from Witness when the query engine identifies a probable brick wall.

**Brief anatomy in UI:**
- Header block: family group name, nature of wall, era, location — displayed as a titled card
- Research questions: numbered, ordered by priority, each with a one-sentence rationale
- Suggested sources: named specifically, with archive location if known
- Historical context: why records may be missing (collapsible — power users want this, casual users may not)
- Breakthrough definition: what finding the right record looks like
- Generation metadata: date, tree name, witnesslives.com footer

**Research Queue screen:**
- Accessible from main navigation (tab bar or sidebar)
- Status indicators: Open (default) / In Progress / Resolved / Archived
- Sort by: date generated, priority, surname line
- When re-import fills a gap: Witness prompts "It looks like you found [ancestor's] parents. Want to mark this brief as resolved?" — satisfying feedback loop
- Brief count visible on tab badge (unresolved only)

**Distribution UI:**
- Share sheet with four explicit options: iMessage, Email, Save as PDF, Copy to clipboard
- PDF output uses the full brief format with Witness header and footer
- Email pre-populates subject: "Research brief: [Family group] — from Witness"
- Copy to clipboard formats for forum posting (plain text, no special characters)

**Tone of research questions:**
- Specific, not generic: "The 1771 Valuation List for Plymouth County" not "check tax records"
- Framed as questions, not instructions: "Is there a probate record for Ebenezer Fobes in Plymouth County?" not "Search probate records"
- Honest about uncertainty: "This is a plausible lead, not a confirmed path"
- Never more than 7 questions per brief — quality over quantity

---

*User Stories document v1.0 — July 2026*  
*Witness — Family History Intelligence*  
*witnesslives.com*
