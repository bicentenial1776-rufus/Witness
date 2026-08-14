/**
 * The in-app FAQ, structured from docs/FAQ.md (the writing surface —
 * keep the two in sync). Grounded in real product behaviors: anomaly
 * exclusion, the probable tier, blood-only relationship labels.
 */

export interface FaqEntry {
  question: string;
  answer: string;
}

export const FAQ: FaqEntry[] = [
  {
    question: 'Why don’t some people show a relationship to me?',
    answer:
      'Every relationship label is computed from your home person, by blood. People with no label are either your in-laws’ families (connected by marriage, not blood) or people in an unconnected branch — GEDCOM files often carry research fragments that were never joined to the main tree. A missing label is honest, not broken.',
  },
  {
    question: 'Why do some results say “probable” with a dashed border?',
    answer:
      'That person is missing a birth or death date, so Witness places them in time using an assumed lifespan of up to 90 years. “Documented” means both ends of the overlap are supported by recorded dates.',
  },
  {
    question: 'Why is someone missing from an “alive during” result I expected them in?',
    answer:
      'If a person’s recorded dates imply a lifespan over 100 years, Witness treats the record as an anomaly and leaves them out — that pattern almost always means two same-name people were merged into one record somewhere upstream. It’s a research lead, not a witness.',
  },
  {
    question: 'Where are the photos?',
    answer:
      'Photos don’t travel in a GEDCOM. The file carries your tree’s facts and structure; images stay on the platform where you added them.',
  },
  {
    question: 'Who is the “home person,” and why did my labels change?',
    answer:
      'The home person is who “you” are in the tree — every label (“your 7th great-grandmother”) is computed from them. Changing the home person recomputes everything, and labels can shift by a generation or switch family sides. Set it under the gear → your tree.',
  },
  {
    question: 'The same ancestor shows two different relationships. Which is right?',
    answer:
      'Possibly both. Deep trees fold back on themselves (cousin marriages, pedigree collapse), so one ancestor can be reachable by several lines. Witness reports the closest path. Tap any relationship label to see the person-by-person chain and judge for yourself.',
  },
  {
    question: 'Will Witness ever change my tree?',
    answer:
      'Never. Witness is read-only by design — your GEDCOM and your tree on Ancestry, FamilySearch, or anywhere else are untouched. When your research grows, export a fresh GEDCOM and re-import.',
  },
  {
    question: 'What about living people?',
    answer:
      'People who appear to be living are excluded from AI-written stories and from anything shareable. Their records stay private to your account.',
  },
  {
    question: 'Why is the Map sparse right after an import?',
    answer:
      'Place coordinates are computed after import, and the free geocoding service works at a deliberate pace — a large tree with thousands of places can take a couple of hours to fully light up; a small export takes minutes. Everything else — the weekly digest, queries, stories, relationships — works immediately. The map fills in as places are located.',
  },
  {
    question: 'How do I cancel my subscription?',
    answer:
      'From the You screen (the gear on Home), under Your subscription — Manage subscription opens the store’s own page, where canceling takes effect at the end of the period you’ve paid for. Subscribed on iPhone? Settings › Apple Account › Subscriptions works too.',
  },
  {
    question: 'How do I delete my account?',
    answer:
      'From the You screen, under Help & account: Delete your account. It removes every tree, shared link, and stored file, then the account itself — permanently. Your GEDCOM files and your trees on other platforms are untouched. Note that deleting the account does not cancel a subscription; cancel that first.',
  },
  {
    question: 'Something looks wrong and it isn’t listed here.',
    answer:
      'Genealogy data is messy — that’s half the fun. Write us at support@witnesslives.com and a real person will dig in with you.',
  },
];
