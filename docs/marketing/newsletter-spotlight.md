# Newsletter notice — drop-in copy for society editors

Purpose: make it a thirty-second yes for a society newsletter editor. Three
lengths. Every claim below is shipped and verified against the app on
2026-09-08 (see `docs/marketing/week1-followups.md` for the fact list).

Tone rules (from the society campaign): factual, humble, no superlatives, no
"revolutionary". Say what it does and what it costs. Members are a
credibility-sensitive audience.

## Short (about 60 words) — for a "Members' corner" or announcements box

**Try Witness, a reading companion for your family tree.** Witness reads the
GEDCOM you already have and opens each morning on one line of your family,
told as a story from the record. It never edits your tree. Free on the App
Store and at witnesslives.com, with a one-month free trial; $19.99 a year
after. A few {{society}} members can have a complimentary subscription in
exchange for their honest feedback — write to rufus@witnesslives.com.

## Standard (about 130 words) — a newsletter item

**A new way to read the tree you've already built**

Witness is an iPhone, iPad, and web app built by a member of the family-history
community, Rufus Howe, who spent decades working with incomplete and
conflicting records in healthcare. It reads your GEDCOM export from Ancestry,
FamilySearch, Family Tree Maker, or any other program, and never changes the
tree where it lives.

Each morning it opens on one line of your family, founder to reader, told as a
story with the record as the authority. It shows who in your tree was alive
for the Mayflower landing or the 1918 flu, holds your people against colonial
passenger lists, the Acadian deportation rolls, and the Union regiments of the
Civil War, runs twenty-two data-integrity checks, and, in a cemetery, reads a
headstone with the camera and tells you whether the stone belongs to someone
in your tree.

Free to download with a one-month trial, then $19.99 a year. {{society}} has
been offered complimentary subscriptions for two or three members willing to
try it and tell the developer what they think. Write to
rufus@witnesslives.com.

## Member-tester call (about 45 words) — when the editor wants a call to action only

**Wanted: two or three members to test a family-history app.** Witness reads
your GEDCOM and turns it into a daily story of your own line, without changing
your tree. Testers receive a complimentary subscription; the developer asks only
for candid feedback. Write to rufus@witnesslives.com with your society's name.

---

## Links to use

Until the web app captures UTMs and Custom Product Pages exist in App Store
Connect (both open items, see `utm-tracker.xlsx` legend), newsletters should
carry **one plain link**: witnesslives.com. The marketing site auto-deploys
from this repo and can carry a per-society landing path later if we want it.

When the plumbing is in place, the link for a society newsletter becomes:

```
https://app.witnesslives.com/?utm_source=society-tier2&utm_medium=email&utm_campaign=witness-phase1&utm_content={{society-slug}}-newsletter
```

and any App Store link uses that channel's Custom Product Page URL, never a
bare UTM link (UTMs do not survive the jump into the App Store).
