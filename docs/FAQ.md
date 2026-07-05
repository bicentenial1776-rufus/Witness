# Witness — Frequently Asked Questions

*(This document is the writing surface for the in-app FAQ at
`apps/mobile/src/constants/faq.ts` — keep the two in sync.)*

---

**Why don't some people show a relationship to me?**
Every relationship label is computed from your home person, by blood. People with no label are either your in-laws' families (connected by marriage, not blood) or people in an unconnected branch — GEDCOM files often carry research fragments that were never joined to the main tree. A missing label is honest, not broken.

**Why do some results say "probable" with a dashed border?**
That person is missing a birth or death date, so Witness places them in time using an assumed lifespan of up to 90 years. "Documented" means both ends of the overlap are supported by recorded dates.

**Why is someone missing from an "alive during" result I expected them in?**
If a person's recorded dates imply a lifespan over 100 years, Witness treats the record as an anomaly and leaves them out — that pattern almost always means two same-name people were merged into one record somewhere upstream. It's a research lead, not a witness.

**Where are the photos?**
Photos don't travel in a GEDCOM. The file carries your tree's facts and structure; images stay on the platform where you added them.

**Who is the "home person," and why did my labels change?**
The home person is who "you" are in the tree — every label ("your 7th great-grandmother") is computed from them. Changing the home person recomputes everything, and labels can shift by a generation or switch family sides. Set it under the gear → your tree.

**The same ancestor shows two different relationships. Which is right?**
Possibly both. Deep trees fold back on themselves (cousin marriages, pedigree collapse), so one ancestor can be reachable by several lines. Witness reports the closest path. Tap any relationship label to see the person-by-person chain and judge for yourself.

**Will Witness ever change my tree?**
Never. Witness is read-only by design — your GEDCOM and your tree on Ancestry, FamilySearch, or anywhere else are untouched. When your research grows, export a fresh GEDCOM and re-import.

**What about living people?**
People who appear to be living are excluded from AI-written stories and from anything shareable. Their records stay private to your account.

**Something looks wrong and it isn't listed here.**
Genealogy data is messy — that's half the fun. Write us at support@witnesslives.com and a real person will dig in with you.
