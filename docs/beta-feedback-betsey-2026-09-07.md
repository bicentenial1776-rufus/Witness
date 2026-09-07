# Beta feedback: Betsey Teady, September 7, 2026

**Format:** FaceTime call, Rufus driving a screen-share walkthrough on Betsey's
iPad. Betsey is a family beta tester — not a developer, describes herself as
"such a ninny when it comes to computer things" — using her own FamilySearch-
imported tree. Her reactions are a good proxy for the least technical end of
the target audience.

Overall read: strongly positive. The three features Rufus shipped in direct
response to her prior feedback (One Generation at a Time, Relatives by Kind,
the universal list filter) landed exactly as intended — unprompted "game
changer" and "ridiculously helpful" reactions. The one real structural
complaint — FamilySearch sync friction — turns out to already be scheduled
work (Tree Pulse / GEDCOM Refresh), just not yet shipped to iPad/iPhone.

---

## Confirmed wins — keep doing this

1. **One Generation at a Time.** Walking the tree gen-by-gen ("these are my
   parents... these are my parents' parents") was an immediate, unprompted
   "that's a game changer." This shipped *because* of feedback Betsey gave
   Rufus the day before — the fastest possible feedback loop, and it worked.

2. **Relatives by Kind + the universal filter/sort.** Letting her slice her
   136 first-cousins-once-removed by blood/distant/direct-line, and sort by
   name, relationship, or birth/death date, produced real discovery ("I have
   one first cousin in my life... but 136 removed"). Notably, this filter
   exists on *every* list in the app now, not just the one it was built for.

3. **At the Stone (headstone OCR + tree match).** The standout feature of the
   call. Multi-angle photo capture, offline-tolerant (queues for lookup once
   back in coverage), reads the stone and checks it against the tree. Betsey
   had already field-tested it in Maine before this call and it worked. This
   is a genuine differentiator worth leading with in marketing — nothing else
   discussed produced as strong a reaction ("Oh my gosh").

4. **Provenance prompts ("How do you know this?").** When she added a death
   date from an obituary, the app asked her to substantiate it and nudged her
   toward attaching the document. She responded well to this — it read as
   rigor, not friction, and she volunteered that she has unsorted family
   papers she'd now consider scanning in.

5. **Kindred couples** (marriages between people already related in the
   tree) landed well ("well, you want to keep it in the family, right?").

6. **Human-in-the-loop record matching** (Civil War, Revolutionary War,
   Mayflower/passenger-list candidates surfaced as "1 record to sort out,"
   confirm or reject rather than auto-applied) matches exactly what she said
   she wanted before Rufus showed it to her.

---

## Friction — ranked

### 1. FamilySearch sync is a two-hop manual chore (real pain, already being fixed)
Because FamilySearch has no GEDCOM export of its own, her flow is:
FamilySearch → RootsMagic (sync) → export GEDCOM → import into Witness. Any
tree change on FamilySearch's end requires repeating all four steps by hand —
Witness has no way to know the source changed. She named this friction
unprompted at the end of the call.

This is not a new problem: `docs/competitive-treelab.md:195-199` already
calls "each upload creates a new tree" *"our roughest shipped edge,"* and
Tree Pulse / GEDCOM Refresh (diff a re-upload against the saved tree, report
what changed, replace instead of duplicate) is built and shipped in the
browser (`packages/core/src/pulse/refresh.ts`) — just not yet on iPhone/iPad,
which is the only surface Betsey uses. **Action: this is a "ship what
already exists" problem, not a "design something new" problem** — getting
Tree Pulse onto mobile directly resolves her single biggest complaint.

### 2. "Free certified partner software" copy is opaque to a non-technical reader
The in-app blurb she hit (`apps/mobile/src/constants/gedcom-guide.ts:54-63`)
reads: *"No export of its own — use free partner software"* / *"getting
data out is done through FamilySearch's API — which is open to certified
partner programs."* Betsey: "I didn't know what that meant." The
explanation is accurate but assumes API/partner-program vocabulary she
doesn't have. **Suggest simplifying the headline line** to something like
*"FamilySearch won't let any app pull your tree directly — we'll walk you
through the free 5-minute workaround"* and pushing "certified partner
program" language down into the detail copy, not the first sentence.

### 3. Unexpected FamilySearch re-authentication
Mid-call she was suddenly asked to "sign in with Google or some other kind
of thing" to reach FamilySearch records, and hadn't seen that before. Likely
just an expired session token, not a bug — but worth a support-doc line or
a friendlier in-app explanation for *why* this happens, since an
unexplained auth wall is exactly the kind of moment that stops a low-
confidence user cold ("I would have absolutely no idea what to do").

### 4. Onboarding not consistently seen across devices
She saw the welcome/tutorial flow on her phone for the first time this
morning and said she'd never seen it on the iPad. Worth checking whether
onboarding is scoped per-install rather than per-account — if she used the
iPad first, she may simply have never gotten a fresh install on it since
onboarding shipped. Low priority, but confirm it isn't silently skipping on
one platform.

### Not actually gaps (already solved, just newly discovered by her)
- **"How do I say what cousin this is?"** — she asked this organically, then
  Rufus showed her the exact feature that answers it (Relatives by Kind, the
  relationship label per person, the direct-line up/down arrow vs. blood-drop
  vs. distant-link icons). No build needed; this is a discoverability win
  already landed, worth watching whether *new* users find it without a guide
  walking them through it.
- **Fan chart** — she loves FamilySearch's fan chart for its sentimental/
  field-use value (stood in an ancestral church holding a printed one). This
  is explicitly a deliberate non-goal for Witness: `docs/competitive-
  treelab.md:205-209` — *"Do not chase fan charts... a year of work to draw
  level on the axis where they are strongest and we are not differentiated."*
  Worth knowing this will keep coming up from FamilySearch-native users, but
  the existing call not to build it looks correct — At the Stone is the
  actual answer to the same emotional need ("stand in front of your 10th
  great-grandmother"), and it's already differentiated instead of chasing a
  competitor's strength.

---

## Open items to decide, not yet acted on
- **Printing a chart to hang up or mail to Staples** — she asked in passing.
  Given the fan-chart non-goal above, if a "print/export a line" want keeps
  recurring, the GEDCOM Export Guide / worksheet CSV export
  (`packages/core/src/export/csv.ts`) may already be the right answer rather
  than building a print layout — worth checking if that's discoverable from
  where she'd look for it.
- **Family Sharing (up to 4 invitees)** — shown to her this call but not yet
  tried. Follow up next check-in on whether her kids actually join and what
  breaks.

---

## Process note worth keeping
Ruth's one-off request on the ocean-crossings list ("I want to filter this
list") became the universal list filter, not a special case. That
generalization habit — *"is this actually a system-wide change?"* — is what
turned one person's complaint into three separate "game changer" reactions
across two different testers. Worth staying deliberate about applying it the
next time a tester names a narrow ask.
