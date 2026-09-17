# Web app walkthrough notes — Rufus, 2026-09-17

Rufus went through app.witnesslives.com signed in as Rich Douglass (61,773-person
tree, freshly re-imported with 10,314 person notes) after the day's performance
work. "Mostly worked fine"; the items below are what he would improve.

**Ordering.** These come *after* the performance follow-ups still open from the
same day, in this order: (1) browser-side fallback when `compute-relationships`
hits the edge runtime's resource limit on large trees, (2) precompute Tree
Health / Orphan Records at import instead of per session, (3) a persistent
tree-index copy on web, (4) the You-screen delete guard for in-flight imports.

Items marked **[decide]** need a product decision or a short interview before
building; the rest are straightforward.

## Sign-in

1. Password field: offer a way to view the password while entering it.

## Home (especially new, large trees)

2. Right after a large import the Home screen is sparse while sections are still
   being generated. In each section that is on its way (On this day, A
   generational story, Family graph of the day, …) show a note that the app is
   processing, and if possible an estimate of when it will appear.
   *Context: after a (re)import the NARA matching, geocoding, story-arc warming
   and enrichment all regenerate on their own schedules; the app currently
   shows nothing while they do.*

## Left navigation

3. **[decide]** Keep "Witness"; remove the tree name from the nav; items are
   Home, Tree, Explore, Map.

## Tree tab

4. Show the tree name and the last upload/refresh date; keep the people /
   families / places stats.
5. Below that, surface "Who gets featured" from Preferences: Direct, Blood,
   Blood and married.
6. Field Guide; Questions and Answers.
7. Family sharing with invites and their status. Make the invite entry
   explicit that it is **one email per invite** — Rich put three email
   addresses into a single invite, evidently thinking that was the way.

## Portrait (ancestor) view

8. **[decide]** Move "From your file" into the Overview tab (today it is under
   Life & Times); rename it "Notes from your file"; put a boundary around it.
   State that the story uses these notes as a reference — and if it does not
   already, feed them to the story writer for additional material.
   *Context: the imported-notes brief deliberately keeps file notes out of the
   story writer ("never fed to the story writer"); reversing that is a product
   call, not a bug.* Make the notes searchable.
9. Move the "Additional note" (Your note) below the portrait view; state that it
   stays within Witness and is searchable; make it searchable.

## General

10. **[decide]** A search function on every screen: one standard search UI
    across the top of Home, Tree, Explore and Map, with a boundary and no
    words inside the text entry (placeholder text in the box is confusing).
11. **[decide]** It is not obvious what is selectable. Make *all* selectable
    text follow one convention — a different color and underlined. This is
    tripping users up.
12. Whenever a screen is building, say so, and give a sense of how long it
    might take. *Context: on the 61k tree the first whole-tree screen of a
    session takes 30–40 s today.*
13. Find a Grave burial record: can the URL be inserted into the box
    automatically rather than by the user?
14. **[decide]** Back arrow: add the word "Back" — better still, be
    descriptive, e.g. "Back to One Generation at a Time".
15. Selecting the back button shows a 2–5 second lag. *Context: the automated
    run measured ~8 s for "back to Tree tab" including settle; the Tree tab
    re-renders the family graph on return.*
16. "See the line": reconstruct the graphic to show the up and down
    relationships when the relationship is a cousin one.
17. In the portrait view it is not obvious a map exists — the arrow is too
    small. Display a "Show / Hide map" toggle.
18. Nearby (Map) says "Witness needs your location to find the ancestors around
    you — allow location access when your browser asks, then reload." — but the
    browser never asks. *Likely the geolocation request is not being issued
    from a user gesture, or is failing silently on web.*

## Family Graph

19. **[decide]** The world events and Presidents feature displays its
    information in a confused way and is frequently truncated. Find a better
    presentation.

## Tree health / Getting To Work

20. "Your commonest names" is not working.

## National Archives

21. No information shown. *Possibly because the large tree's records are still
    being fetched: the re-imported tree started with an empty NARA enrichment
    state and the matcher refills it on its own schedule. Confirm whether this
    is a wait or a bug before treating it as one.*
