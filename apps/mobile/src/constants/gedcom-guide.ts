/**
 * The in-app GEDCOM export guide, structured from docs/GEDCOM_EXPORT_GUIDE.md
 * (authored by Rufus, July 2026). Keep the two in sync: the doc is the
 * writing surface, this is the rendering surface.
 */

export interface GuideSection {
  heading?: string;
  intro?: string;
  steps: string[];
  note?: string;
}

export interface PlatformGuide {
  id: string;
  name: string;
  /** One-liner on the picker card. */
  blurb: string;
  /** Opens in the in-app browser from the steps screen. */
  url?: string;
  urlLabel?: string;
  intro?: string;
  sections: GuideSection[];
}

export const GEDCOM_GUIDE: PlatformGuide[] = [
  {
    id: 'ancestry',
    name: 'Ancestry.com',
    blurb: 'The most common starting point',
    url: 'https://www.ancestry.com/family-tree/trees',
    urlLabel: 'Open Ancestry.com',
    intro:
      'You must be the owner of the tree — if someone else built it, they’ll need to export it and send you the file.',
    sections: [
      {
        steps: [
          'Sign in at ancestry.com and click the Trees tab at the top of the page',
          'Select the family tree you want to export',
          'Click the tree name in the upper-left corner (or the three dots on the left toolbar) and choose Tree Settings',
          'Find the Manage your tree section on the right side',
          'Click Export tree',
          'The button will spin and read “Generating a GEDCOM file” — a large tree can take a minute or two',
          'When it finishes, click Download your GEDCOM file',
          'The .ged file saves to your device — note where it lands (usually Downloads)',
        ],
        note: 'Your subscription can be lapsed and export still works — Ancestry retains your tree after cancellation.',
      },
    ],
  },
  {
    id: 'familysearch',
    name: 'FamilySearch',
    blurb: 'One shared world tree — two ways to export',
    url: 'https://www.familysearch.org/innovate/export',
    urlLabel: 'Open the FamilySearch export page',
    intro:
      'FamilySearch’s Family Tree is one shared, collaborative tree rather than a personal tree you own — so there are two paths, depending on how much of your line you want.',
    sections: [
      {
        heading: 'Option A — Quick export (8 generations)',
        intro: 'A direct export of 8 generations of your ancestors.',
        steps: [
          'Sign in at familysearch.org',
          'Go to familysearch.org/innovate/export',
          'Click the Export button',
          'Save the downloaded file',
        ],
        note: 'Witness reads this file directly — including FamilySearch’s newest format. It covers your direct ancestors but not cousins, siblings, and collateral lines.',
      },
      {
        heading: 'Option B — Full tree (via free companion software)',
        intro:
          'For your complete FamilySearch tree — all branches — use a free certified partner program on your computer.',
        steps: [
          'Download RootsMagic Essentials (free, Mac and Windows) from rootsmagic.com',
          'Install and open it, then choose Create a new file and name it',
          'When asked what to do next, choose to import information from FamilySearch Family Tree',
          'Sign in to FamilySearch when prompted',
          'Choose how many generations to import, then click Import (a large tree takes several minutes)',
          'When the import completes, go to File → Export, accept the defaults, and click OK',
          'Name the file and save it as a .ged',
        ],
        note: 'Ancestral Quest and Legacy Family Tree are certified alternatives with a similar import-then-export pattern.',
      },
    ],
  },
  {
    id: 'myheritage',
    name: 'MyHeritage',
    blurb: 'Sends your file by email',
    url: 'https://www.myheritage.com',
    urlLabel: 'Open MyHeritage.com',
    sections: [
      {
        steps: [
          'Sign in at myheritage.com',
          'Hover over the Family tree tab and open your tree management page (or your family site’s tree settings)',
          'Find the tree you want and click Export to GEDCOM',
          'Click Begin the export',
          'MyHeritage emails you a download link — check your inbox',
          'Click the link in the email and save the .ged file to your device',
        ],
        note: 'The file arrives by email rather than downloading immediately — don’t be surprised when the download doesn’t start right away.',
      },
    ],
  },
  {
    id: 'findmypast',
    name: 'Findmypast',
    blurb: 'Export lives next to your tree list',
    url: 'https://www.findmypast.com',
    urlLabel: 'Open Findmypast.com',
    sections: [
      {
        steps: [
          'Sign in at findmypast.com and go to your Family Tree section',
          'Each tree in your list has three buttons on the right: Settings, Export tree, and Delete tree',
          'Click Export tree',
          'Follow the prompts to generate and download the file',
          'Save the .ged file to your device',
        ],
      },
    ],
  },
  {
    id: 'desktop',
    name: 'Desktop software',
    blurb: 'Family Tree Maker, RootsMagic, Legacy, Gramps',
    sections: [
      {
        heading: 'Family Tree Maker (Mac and Windows)',
        steps: [
          'Open your tree in Family Tree Maker',
          'Go to File → Export',
          'Choose Entire File (or select specific individuals)',
          'Set the output format to GEDCOM',
          'Click OK, name the file, and save',
        ],
      },
      {
        heading: 'RootsMagic',
        steps: [
          'Open your database in RootsMagic',
          'Go to File → Export',
          'Select the people to include (typically Everyone) and review the privacy options',
          'Click OK, name the file, and save as .ged',
        ],
      },
      {
        heading: 'Legacy Family Tree (Windows)',
        steps: [
          'Open your family file in Legacy',
          'Go to File → Export To → GEDCOM File',
          'Review the options, click Select File Name and START EXPORT',
          'Name the file and save',
        ],
      },
      {
        heading: 'Gramps (free, open source)',
        steps: [
          'Open your tree in Gramps',
          'Go to Family Trees → Export',
          'Choose GEDCOM as the format and follow the prompts',
        ],
      },
    ],
  },
];

export function getPlatformGuide(id: string): PlatformGuide | undefined {
  return GEDCOM_GUIDE.find((platform) => platform.id === id);
}

/** The shared "get the file onto this device" coda shown on every platform. */
export const TRANSFER_TIPS: { title: string; text: string }[] = [
  {
    title: 'Exported on this device? This is the easiest way',
    text: 'Wherever the file landed — Downloads, Mail, Files — tap it, tap Share, and choose Witness from the list. It opens right inside the app, ready to import. No picker, no folders.',
  },
  {
    title: 'AirDrop (Mac users)',
    text: 'Right-click the file on your Mac, choose Share → AirDrop, and send it to this device. When it arrives, tap it and choose Witness — or use the import picker below.',
  },
  {
    title: 'iCloud Drive',
    text: 'Save the file to iCloud Drive on your computer. On this device, open the Files app, find it in iCloud Drive, tap it, and choose Witness.',
  },
  {
    title: 'Email it to yourself',
    text: 'Attach the .ged file to an email, open the email on this device, tap and hold the attachment, and choose Witness.',
  },
];
