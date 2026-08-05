# Getting Your Family Tree Into Witness
### How to download a GEDCOM file from every major genealogy site

*Witness — Family History Intelligence · witnesslives.com*

*(Authored by Rufus, July 2026. This document is the writing surface for the
in-app guide at `apps/mobile/src/constants/gedcom-guide.ts` — keep the two in
sync.)*

---

## What Is a GEDCOM File?

A GEDCOM (GEnealogical Data COMmunication) file is the universal format for family tree data — the standard way to move a tree between genealogy programs. Nearly every major platform can produce one. It's a single file, usually ending in `.ged`, containing everyone in your tree: names, dates, places, relationships, and events.

**The exception is FamilySearch,** which does not offer its users a GEDCOM export at all — see that section below for the route that does work.

Witness reads your GEDCOM and brings it to life. You keep building your tree wherever you build it today — Ancestry, FamilySearch, MyHeritage, or desktop software. Witness never changes your tree. It reads, enriches, and discovers.

**Two things to know before you start:**

**Photos don't travel in a GEDCOM.** The file contains your tree's facts and structure, but photos and document images stay on the platform where you added them. Your tree in Witness will be complete — just without the images for now.

**File size is rarely a problem.** Even a tree of 5,000 people typically produces a file well under 15 MB. Witness handles large trees comfortably.

---

## Ancestry.com

*The most common starting point. Requires you to be the owner of the tree — if someone else built it, they'll need to export it for you.*

1. Sign in at **ancestry.com** and click the **Trees** tab at the top of the page
2. Select the family tree you want to export
3. Click the **tree name** in the upper-left corner of the tree view (or the three dots on the left toolbar) and choose **Tree Settings**
4. On the Tree Settings page, find the **Manage your tree** section on the right side
5. Click **Export tree**
6. The button will spin and read *"Generating a GEDCOM file"* — for a large tree this can take a minute or two
7. When it finishes, click **Download your GEDCOM file**
8. The `.ged` file saves to your device — note where it lands (usually your Downloads folder)

**Good to know:** Your subscription can be lapsed and export still works — Ancestry retains your tree after cancellation. Ancestry exports in GEDCOM 5.5.1 format, which Witness fully supports.

---

## FamilySearch

*FamilySearch works differently from every other site here — read this section before starting.*

**FamilySearch does not give you a GEDCOM export.** This is the single most
important thing to know, and it is easy to get wrong: FamilySearch's Family
Tree is one shared, collaborative tree rather than a personal tree you own, and
there is no "export my tree" button for users. Programmatic access is by
**FamilySearch's API**, which is granted to approved partners — Witness is
pursuing that access, and this section will be rewritten when we have it.

> **Correction, August 2026.** Earlier versions of this guide described a
> direct 8-generation GEDCOM 7.0 export at `familysearch.org/innovate/export`.
> That path is not available to users, and the instruction has been removed
> here and from the in-app guide. Do not reinstate it without confirming it
> first-hand while signed in.

Until Witness has API access, there is exactly one route, and it works because
the partner program — not you — is the one talking to FamilySearch's API.

### The route that works — free certified partner software

A FamilySearch **certified partner program** can pull your tree out over the
API and then export a GEDCOM of its own, which Witness reads normally. The free
path:

1. Download **RootsMagic Essentials** (free, Mac and Windows) from **rootsmagic.com**
2. Install and open it, then choose **Create a new file** and name it
3. When asked what to do next, choose to **import information from FamilySearch Family Tree**
4. Sign in to FamilySearch when prompted
5. Choose how many generations to import, then click **Import** (a large tree takes several minutes)
6. When the import completes, go to **File → Export**, accept the defaults, and click **OK**
7. Name the file and save it as a `.ged`

*Ancestral Quest and Legacy Family Tree are certified alternatives that follow a similar import-then-export pattern.*

---

## MyHeritage

1. Sign in at **myheritage.com**
2. Hover over the **Family tree** tab in the navigation bar and open your tree management page (or go to your family site's tree settings)
3. Find the tree you want and click **Export to GEDCOM**
4. Click **Begin the export**
5. MyHeritage emails you a **download link** — check your inbox
6. Click the link in the email and save the `.ged` file to your device

**Good to know:** MyHeritage sends the file by email rather than downloading it immediately — don't be surprised when the download doesn't start right away.

---

## Findmypast

1. Sign in at **findmypast.com** and go to your **Family Tree** section
2. You'll see your list of trees, each with three buttons to the right: **Settings**, **Export tree**, and **Delete tree**
3. Click **Export tree**
4. Follow the prompts to generate and download the file
5. Save the `.ged` file to your device

---

## Desktop Software

### Family Tree Maker (Mac and Windows)

1. Open your tree in **Family Tree Maker**
2. Go to **File → Export**
3. Choose **Entire File** (or select specific individuals if you prefer)
4. Set the output format to **GEDCOM**
5. Click **OK**, name the file, and save

### RootsMagic

1. Open your database in **RootsMagic**
2. Go to **File → Export**
3. Select the people to include (typically **Everyone**) and review the privacy options
4. Click **OK**, name the file, and save as `.ged`

### Legacy Family Tree (Windows)

1. Open your family file in **Legacy**
2. Go to **File → Export To → GEDCOM File**
3. Review the options, click **Select File Name and START EXPORT**
4. Name the file and save

### Gramps (free, open source)

1. Open your tree in **Gramps**
2. Go to **Family Trees → Export**
3. Choose **GEDCOM** as the format and follow the prompts

---

## Getting the File Into Witness

Once you have your `.ged` file, getting it to your iPhone or iPad takes under a minute. Any of these paths works:

**AirDrop (Mac users — fastest).** Right-click the file on your Mac, choose Share → AirDrop, and send it to your iPhone or iPad. Open Witness and import.

**iCloud Drive.** Save the file to iCloud Drive on your computer. In Witness, tap Import and browse to iCloud Drive in the Files picker.

**Email it to yourself.** Attach the `.ged` file to an email, open the email on your device, tap and hold the attachment, and choose Witness (or save to Files, then import).

**Directly on the device.** If you exported the file using Safari on your iPad, it's already in your Downloads folder — Witness's import picker will find it there.

Witness accepts `.ged` files from all versions above (GEDCOM 5.5, 5.5.1, and 7.0). It also reads zipped `.gdz` packages — the GEDCOM 7.0 bundle format — though note that this capability is currently unreachable for FamilySearch users, since FamilySearch offers them no export at all.

---

## If Something Goes Wrong

**"I can't find the export option."** Platform menus move over time. Search the platform's own help center for "export GEDCOM" — every site above documents its current steps.

**"The tree belongs to a family member."** Only the tree's owner can export it on most platforms. Ask them to follow the steps above and send you the file — it's one email attachment.

**"My file won't import."** Make sure the file ends in `.ged` (or `.gdz`). If your platform produced a `.zip`, try unzipping it first — the `.ged` file will be inside. If it still won't import, contact us at support@witnesslives.com and attach the file if you're comfortable doing so — a real person will figure it out with you.

**"Will Witness change my tree?"** Never. Witness is read-only by design. Your GEDCOM is encrypted on your device before upload, and your tree on Ancestry, FamilySearch, or anywhere else is untouched. When your research grows, export a fresh GEDCOM and re-import — Witness will show you what's new.

---

*Witness — Family History Intelligence*
*Witnesses to History · witnesslives.com*
