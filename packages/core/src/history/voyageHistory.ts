/**
 * The "?" behind every crossing label (Rufus's spec, 2026-09-02): a short,
 * historically accurate account of what the label actually means, shown on
 * demand and dismissed with a tap. Three to four sentences, never more.
 *
 * The famous voyages get curated texts; every other voyage gets an honest
 * assembly from what its record carries — era, ports, and above all WHERE
 * THE NAMES COME FROM, because the provenance is the meaning. General
 * history here is common knowledge; no passenger fact is authored.
 */

export interface VoyageFacts {
  voyageId: string;
  ship: string;
  arrivalYear: number;
  departurePort?: string | null;
  arrivalPlace?: string | null;
  source: string;
}

const CURATED: Record<string, string> = {
  'jamestown-1607':
    'The Susan Constant, Godspeed and Discovery left London in December 1606 under Christopher Newport and reached Virginia in late April 1607. Their 104 men and boys founded Jamestown, England’s first permanent settlement in America. Most did not live long: disease, famine and the “starving time” of 1609–10 killed the great majority, so descent from most of these names is impossible — which is itself worth knowing.',
  'mayflower-1620':
    'The Mayflower left Plymouth, England in September 1620 with about 102 passengers — religious separatists from Leiden and “strangers” recruited by the venture’s investors — and anchored off Cape Cod that November. Nearly half the company died in the first winter at Plymouth. Tens of millions of living people descend from those who survived, and two centuries of enthusiasm have produced many disproved descents, so a matching name here is the beginning of a question, not an ancestry.',
  'fortune-1621':
    'The Fortune reached Plymouth in November 1621, the colony’s first resupply, carrying about 35 new settlers and almost no provisions — the newcomers doubled the mouths to feed just after the first harvest. On her way home she was seized by a French warship and stripped of her cargo. Her list survives through the 1623 land division rather than any ship’s manifest.',
  'anne-1623':
    'The Anne arrived at Plymouth in the summer of 1623 with her small consort the Little James, carrying about 90 passengers — many of them the wives and children of men who had sailed alone on the Mayflower and Fortune three years earlier. Her arrival reunited families the first crossings had split. The passengers are known from the 1623 division of land, not from a surviving manifest.',
  'little-james-1623':
    'The Little James, a pinnace of forty-four tons, sailed in company with the Anne and reached Plymouth in the summer of 1623. Built to serve the colony as a fishing and trading vessel, she was later wrecked at Damariscove and seized for debt — a hard-luck ship remembered mostly for who she carried. Her passengers are known from the 1623 land division, not a manifest.',
  'winthrop-fleet-1630':
    'Eleven ships led by the Arbella sailed from the Isle of Wight in the spring of 1630 carrying some 700 Puritan colonists — the founding migration of Massachusetts Bay, and the largest single English crossing to New England to that date. John Winthrop’s “city upon a hill” discourse belongs to this voyage. No full passenger lists survive; the names come from reconstructions, chiefly Charles Banks’s of 1930, refined by later scholarship.',
  'ark-and-dove-1634':
    'The Ark and the pinnace Dove left Cowes in November 1633 and landed at St. Clement’s Island in March 1634, founding the Maryland colony under the charter granted to Cecil Calvert, Lord Baltimore — a refuge where Catholics could practice openly. No passenger manifest survives for either ship. Every published list is a reconstruction from later land-patent claims, so presence aboard is inferred from what colonists later swore, never recorded at the rail.',
};

function eraSentence(year: number): string {
  if (year <= 1610)
    return 'This was the first, most dangerous decade of English settlement, when a crossing took eight weeks or more and most who made it did not survive their first years ashore.';
  if (year <= 1629)
    return 'This was the Plymouth era, when crossings were few, ships were small, and a single vessel’s arrival could double a colony.';
  if (year <= 1640)
    return 'This voyage belongs to the Great Migration: between 1630 and 1640 some 20,000 English settlers crossed to New England, and tens of thousands more went to Virginia and the island colonies.';
  return 'In the age of sail the Atlantic passage took six to twelve weeks, and passengers were recorded — when they were recorded at all — at the port of departure, not on arrival.';
}

function provenanceSentence(source: string): string {
  if (/Hotten/i.test(source))
    return 'The names here come from the London port registers — the certificates emigrants swore before sailing, with their ages — transcribed from the Public Record Office by John Camden Hotten in 1874.';
  if (/Banks/i.test(source))
    return 'The names here come from Charles Edward Banks’s 1930 reconstruction from colonial records — his judgment of who sailed, usually without dates, compiled three centuries after the fact.';
  if (/land patent/i.test(source))
    return 'The names here are reconstructed from later land-patent claims, not from any surviving manifest.';
  if (/Wikipedia/i.test(source))
    return 'The names here follow the standard published transcriptions of the surviving lists.';
  return 'The names here come from a published transcription; the row’s source line says which.';
}

/** The 3–4 sentence account behind a voyage label. */
export function voyageExplainer(voyage: VoyageFacts): string {
  const curated = CURATED[voyage.voyageId];
  if (curated) return curated;
  const route =
    voyage.departurePort && voyage.arrivalPlace
      ? `The ${voyage.ship} sailed from ${voyage.departurePort} in ${voyage.arrivalYear}, bound for ${voyage.arrivalPlace}.`
      : `The ${voyage.ship} made her crossing in ${voyage.arrivalYear}.`;
  return [
    route,
    eraSentence(voyage.arrivalYear),
    provenanceSentence(voyage.source),
    'A matching name is a candidate to research, never proof that your ancestor was aboard.',
  ].join(' ');
}

/** The 3–4 sentence account behind the event-derived crossing flag —
    the chip that appears when a person's own records stand on both
    shores of an ocean. */
export function shoreCrossingExplainer(ocean: 'atlantic' | 'pacific'): string {
  const oceanName = ocean === 'atlantic' ? 'Atlantic' : 'Pacific';
  return (
    `This flag is read from the person’s own recorded events: something in their record happened on one side of the ${oceanName}, and something later on the other, so somewhere between those two records lies an ocean crossing. ` +
    'No ship or date is claimed — only that the shore changed. ' +
    (ocean === 'atlantic'
      ? 'In the age of sail the Atlantic passage took six to twelve weeks in crowded, unhealthy quarters, and for most emigrants it was made exactly once. '
      : 'Pacific crossings were longer still — months at sea — and remained rare until the age of steam. ') +
    'Finding the ship is the research question this flag opens.'
  );
}
