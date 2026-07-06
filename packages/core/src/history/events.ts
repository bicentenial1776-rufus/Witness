/**
 * Curated historical event library for temporal queries ("who was alive
 * during X?"). Hand-authored: these are the events behind the curated
 * shelf and the "Lived Through" tags, ordered chronologically. Ranges use
 * inclusive years; single-year moments set startYear === endYear.
 *
 * Events are never shown as a browsable catalog (docs/QUERY_LIBRARY.md,
 * Implementation Architecture) — they reach the user through the shelf,
 * ancestor-card tags, and search.
 */

/** How wide the event's reach was; ranking prefers major. */
export type EventTier = 'major' | 'regional' | 'local';

/**
 * The bounding regions the event touched, using the canonical display
 * regions the place classifier produces (US states, Canadian provinces
 * including Acadia, or country names). Absent means everywhere.
 */
export interface EventGeoScope {
  regions: string[];
}

export interface HistoricalEvent {
  /** Stable slug used in routes and caching keys. Never reuse or rename. */
  id: string;
  name: string;
  startYear: number;
  endYear: number;
  /** Coarse geographic scope shown on the prompt card. */
  region: string;
  /** One-sentence context line for cards and results headers. */
  summary: string;
  /** Extra search terms beyond the visible text ("mayflower", "cajun"). */
  keywords?: string[];
  tier: EventTier;
  geoScope?: EventGeoScope;
  /** Heritage branches the event speaks to (e.g. ['acadian']). */
  lensAffinity?: string[];
}

const NEW_ENGLAND = [
  'Massachusetts',
  'Rhode Island',
  'Connecticut',
  'New Hampshire',
  'Maine',
  'Vermont',
];

export const HISTORICAL_EVENTS: readonly HistoricalEvent[] = [
  {
    id: 'mayflower-landing',
    name: 'The Mayflower Lands',
    startYear: 1620,
    endYear: 1620,
    region: 'New England',
    summary: 'The Pilgrims anchored off Cape Cod and founded Plymouth Colony.',
    keywords: ['mayflower', 'pilgrims', 'plymouth'],
    tier: 'regional',
    geoScope: { regions: NEW_ENGLAND },
    lensAffinity: ['colonial_new_england'],
  },
  {
    id: 'founding-of-rhode-island',
    name: 'Founding of Rhode Island',
    startYear: 1636,
    endYear: 1636,
    region: 'New England',
    summary:
      'Roger Williams, banished from Massachusetts Bay, founded Providence on the principle of liberty of conscience.',
    keywords: ['roger williams', 'providence'],
    tier: 'regional',
    geoScope: { regions: ['Rhode Island', 'Massachusetts'] },
    lensAffinity: ['colonial_new_england'],
  },
  {
    id: 'king-philips-war',
    name: "King Philip's War",
    startYear: 1675,
    endYear: 1678,
    region: 'New England',
    summary:
      'The deadliest war per capita in American colonial history swept through the towns of New England.',
    tier: 'regional',
    geoScope: { regions: NEW_ENGLAND },
    lensAffinity: ['colonial_new_england'],
  },
  {
    id: 'salem-witch-trials',
    name: 'Salem Witch Trials',
    startYear: 1692,
    endYear: 1693,
    region: 'New England',
    summary: 'Accusations of witchcraft consumed Salem and the surrounding Massachusetts villages.',
    tier: 'local',
    geoScope: { regions: ['Massachusetts'] },
    lensAffinity: ['colonial_new_england'],
  },
  {
    id: 'great-awakening',
    name: 'The Great Awakening',
    startYear: 1730,
    endYear: 1745,
    region: 'American Colonies',
    summary:
      'A wave of religious revival swept the colonies, filling meetinghouses and splitting congregations.',
    keywords: ['revival', 'whitefield', 'edwards'],
    tier: 'regional',
    geoScope: { regions: NEW_ENGLAND },
    lensAffinity: ['colonial_new_england'],
  },
  {
    id: 'french-and-indian-war',
    name: 'French and Indian War',
    startYear: 1754,
    endYear: 1763,
    region: 'North America',
    summary: 'Britain and France fought for the continent, drawing colonial militias into the frontier.',
    tier: 'major',
    geoScope: {
      regions: [
        'New York',
        'Pennsylvania',
        'Virginia',
        'Massachusetts',
        'New Hampshire',
        'Maine',
        'Quebec',
        'Nova Scotia',
      ],
    },
    lensAffinity: ['colonial_new_england', 'french_canadian'],
  },
  {
    id: 'grand-derangement',
    name: 'Le Grand Dérangement',
    startYear: 1755,
    endYear: 1764,
    region: 'Acadia',
    summary: 'The British expelled the Acadian people from their homeland, scattering families across the Atlantic world.',
    keywords: ['acadian', 'expulsion', 'cajun'],
    tier: 'regional',
    geoScope: { regions: ['Acadia', 'Nova Scotia', 'New Brunswick', 'Prince Edward Island'] },
    lensAffinity: ['acadian'],
  },
  {
    id: 'stamp-act',
    name: 'The Stamp Act',
    startYear: 1765,
    endYear: 1766,
    region: 'American Colonies',
    summary:
      "Britain's first direct tax on the colonies required stamped paper for nearly every printed document.",
    tier: 'major',
  },
  {
    id: 'boston-massacre',
    name: 'Boston Massacre',
    startYear: 1770,
    endYear: 1770,
    region: 'New England',
    summary: 'British soldiers fired into a Boston crowd, killing five and hardening colonial resistance.',
    tier: 'local',
    geoScope: { regions: ['Massachusetts'] },
    lensAffinity: ['colonial_new_england'],
  },
  {
    id: 'boston-tea-party',
    name: 'Boston Tea Party',
    startYear: 1773,
    endYear: 1773,
    region: 'New England',
    summary: 'Colonists dumped 342 chests of British tea into Boston Harbor.',
    tier: 'local',
    geoScope: { regions: ['Massachusetts'] },
    lensAffinity: ['colonial_new_england'],
  },
  {
    id: 'american-revolution',
    name: 'American Revolution',
    startYear: 1775,
    endYear: 1783,
    region: 'North America',
    summary: 'Thirteen colonies fought an eight-year war for independence.',
    keywords: ['revolutionary war'],
    tier: 'major',
  },
  {
    id: 'declaration-of-independence',
    name: 'Signing of the Declaration of Independence',
    startYear: 1776,
    endYear: 1776,
    region: 'North America',
    summary: 'The colonies declared themselves free and independent states.',
    tier: 'major',
  },
  {
    id: 'constitution-ratified',
    name: 'Ratification of the Constitution',
    startYear: 1788,
    endYear: 1788,
    region: 'United States',
    summary: 'The United States adopted the framework of government still in force today.',
    tier: 'major',
  },
  {
    id: 'washington-dies',
    name: 'Death of George Washington',
    startYear: 1799,
    endYear: 1799,
    region: 'United States',
    summary: 'George Washington died at Mount Vernon, and the young republic mourned its founding figure.',
    tier: 'major',
  },
  {
    id: 'louisiana-purchase',
    name: 'Louisiana Purchase',
    startYear: 1803,
    endYear: 1803,
    region: 'United States',
    summary: 'The nation doubled in size overnight for fifteen million dollars.',
    tier: 'major',
  },
  {
    id: 'war-of-1812',
    name: 'War of 1812',
    startYear: 1812,
    endYear: 1815,
    region: 'North America',
    summary: 'The young republic fought Britain again, from the Great Lakes to a burning Washington.',
    tier: 'major',
  },
  {
    id: 'erie-canal',
    name: 'Construction of the Erie Canal',
    startYear: 1817,
    endYear: 1825,
    region: 'United States',
    summary:
      'Eight years of digging carved a 363-mile canal that linked the Atlantic to the Great Lakes and pulled migration westward.',
    tier: 'regional',
    geoScope: { regions: ['New York'] },
  },
  {
    id: 'trail-of-tears',
    name: 'Trail of Tears',
    startYear: 1838,
    endYear: 1839,
    region: 'United States',
    summary: 'The United States forced the Cherokee from their homelands on a march west that killed thousands.',
    keywords: ['cherokee', 'removal'],
    tier: 'regional',
    geoScope: { regions: ['Georgia', 'Tennessee', 'Alabama', 'North Carolina', 'Oklahoma'] },
  },
  {
    id: 'irish-famine',
    name: 'The Great Famine',
    startYear: 1845,
    endYear: 1852,
    region: 'Ireland',
    summary: 'Famine killed a million people in Ireland and drove two million more to emigrate.',
    tier: 'regional',
    geoScope: { regions: ['Ireland'] },
    lensAffinity: ['irish'],
  },
  {
    id: 'mexican-american-war',
    name: 'Mexican-American War',
    startYear: 1846,
    endYear: 1848,
    region: 'North America',
    summary: "War with Mexico carried American arms to the Pacific and redrew the continent's map.",
    tier: 'major',
  },
  {
    id: 'california-gold-rush',
    name: 'California Gold Rush',
    startYear: 1848,
    endYear: 1855,
    region: 'United States',
    summary: 'Three hundred thousand people raced to California in search of gold.',
    tier: 'regional',
    geoScope: { regions: ['California'] },
  },
  {
    id: 'civil-war',
    name: 'American Civil War',
    startYear: 1861,
    endYear: 1865,
    region: 'United States',
    summary: 'The war between North and South touched nearly every American family.',
    keywords: ['union', 'confederacy'],
    tier: 'major',
  },
  {
    id: 'lincoln-assassination',
    name: 'Assassination of Abraham Lincoln',
    startYear: 1865,
    endYear: 1865,
    region: 'United States',
    summary: 'Five days after Appomattox, the president was shot at Ford’s Theatre.',
    tier: 'major',
  },
  {
    id: 'transcontinental-railroad',
    name: 'Completion of the Transcontinental Railroad',
    startYear: 1869,
    endYear: 1869,
    region: 'United States',
    summary: 'A golden spike at Promontory Summit joined the coasts by rail.',
    tier: 'major',
  },
  {
    id: 'gilded-age',
    name: 'The Gilded Age',
    startYear: 1870,
    endYear: 1900,
    region: 'United States',
    summary: 'Railroads, factories, and vast new fortunes transformed America in a single generation.',
    tier: 'major',
  },
  {
    id: 'great-chicago-fire',
    name: 'Great Chicago Fire',
    startYear: 1871,
    endYear: 1871,
    region: 'United States',
    summary: 'Fire destroyed three square miles of Chicago and left a third of the city homeless.',
    tier: 'local',
    geoScope: { regions: ['Illinois'] },
  },
  {
    id: 'panic-of-1873',
    name: 'Panic of 1873',
    startYear: 1873,
    endYear: 1879,
    region: 'United States',
    summary: 'A banking collapse set off a depression that idled railroads, factories, and farms for years.',
    keywords: ['depression'],
    tier: 'major',
  },
  {
    id: 'ellis-island-opens',
    name: 'Opening of Ellis Island',
    startYear: 1892,
    endYear: 1892,
    region: 'United States',
    summary: 'The great gateway of American immigration opened in New York Harbor.',
    tier: 'major',
  },
  {
    id: 'panic-of-1893',
    name: 'Panic of 1893',
    startYear: 1893,
    endYear: 1897,
    region: 'United States',
    summary: 'Railroad failures and bank runs plunged the country into the deepest depression it had yet known.',
    keywords: ['depression'],
    tier: 'major',
  },
  {
    id: 'klondike-gold-rush',
    name: 'Klondike Gold Rush',
    startYear: 1896,
    endYear: 1899,
    region: 'Yukon',
    summary: 'Word of gold on the Klondike sent a hundred thousand stampeders toward the Yukon.',
    keywords: ['yukon', 'alaska'],
    tier: 'regional',
    geoScope: { regions: ['Alaska', 'British Columbia'] },
  },
  {
    id: 'wright-brothers-flight',
    name: 'First Flight at Kitty Hawk',
    startYear: 1903,
    endYear: 1903,
    region: 'United States',
    summary: 'At Kitty Hawk, the Wright brothers flew a powered aircraft for twelve seconds.',
    keywords: ['airplane', 'aviation'],
    tier: 'major',
  },
  {
    id: 'san-francisco-earthquake',
    name: 'San Francisco Earthquake',
    startYear: 1906,
    endYear: 1906,
    region: 'United States',
    summary: 'Earthquake and fire destroyed most of San Francisco in three days.',
    tier: 'local',
    geoScope: { regions: ['California'] },
  },
  {
    id: 'titanic',
    name: 'Sinking of the Titanic',
    startYear: 1912,
    endYear: 1912,
    region: 'World',
    summary: 'The unsinkable ship went down in the North Atlantic on its maiden voyage.',
    tier: 'major',
  },
  {
    id: 'world-war-i',
    name: 'World War I',
    startYear: 1914,
    endYear: 1918,
    region: 'World',
    summary: 'The Great War drew millions of Americans into the trenches of Europe.',
    tier: 'major',
  },
  {
    id: 'influenza-1918',
    name: '1918 Influenza Pandemic',
    startYear: 1918,
    endYear: 1920,
    region: 'World',
    summary: 'A pandemic killed more people than the war it followed.',
    keywords: ['spanish flu', 'pandemic'],
    tier: 'major',
  },
  {
    id: 'womens-suffrage',
    name: 'Ratification of the 19th Amendment',
    startYear: 1920,
    endYear: 1920,
    region: 'United States',
    summary: 'American women won the constitutional right to vote.',
    tier: 'major',
  },
  {
    id: 'prohibition',
    name: 'Prohibition',
    startYear: 1920,
    endYear: 1933,
    region: 'United States',
    summary: 'The Eighteenth Amendment outlawed the manufacture and sale of alcohol nationwide.',
    keywords: ['temperance', 'speakeasy'],
    tier: 'major',
  },
  {
    id: 'great-depression',
    name: 'Great Depression',
    startYear: 1929,
    endYear: 1939,
    region: 'World',
    summary: 'A decade of economic collapse reshaped how a generation lived and worked.',
    tier: 'major',
  },
  {
    id: 'dust-bowl',
    name: 'The Dust Bowl',
    startYear: 1930,
    endYear: 1936,
    region: 'United States',
    summary: 'Drought and dust storms stripped the southern Plains and drove families from their farms.',
    tier: 'regional',
    geoScope: { regions: ['Oklahoma', 'Kansas', 'Texas', 'Colorado', 'New Mexico', 'Nebraska'] },
  },
  {
    id: 'world-war-ii',
    name: 'World War II',
    startYear: 1939,
    endYear: 1945,
    region: 'World',
    summary: 'The largest war in human history reached into every American town.',
    tier: 'major',
  },
  {
    id: 'atomic-bomb',
    name: 'The Atomic Bomb',
    startYear: 1945,
    endYear: 1945,
    region: 'World',
    summary: 'Atomic bombs destroyed Hiroshima and Nagasaki, ending the war and opening the nuclear age.',
    keywords: ['hiroshima', 'nagasaki'],
    tier: 'major',
  },
  {
    id: 'korean-war',
    name: 'Korean War',
    startYear: 1950,
    endYear: 1953,
    region: 'World',
    summary: 'American forces fought three years of war on the Korean peninsula.',
    tier: 'major',
  },
  {
    id: 'civil-rights-movement',
    name: 'Civil Rights Movement',
    startYear: 1954,
    endYear: 1968,
    region: 'United States',
    summary: 'From Montgomery to Selma, a movement dismantled legal segregation in America.',
    keywords: ['montgomery', 'selma', 'king'],
    tier: 'major',
  },
  {
    id: 'vietnam-war',
    name: 'Vietnam War Era',
    startYear: 1955,
    endYear: 1975,
    region: 'World',
    summary: 'Two decades of war in Vietnam divided America and defined a generation.',
    tier: 'major',
  },
  {
    id: 'jfk-assassination',
    name: 'Assassination of John F. Kennedy',
    startYear: 1963,
    endYear: 1963,
    region: 'United States',
    summary: 'President Kennedy was shot in Dallas, and the country stopped.',
    keywords: ['kennedy', 'dallas'],
    tier: 'major',
  },
  {
    id: 'moon-landing',
    name: 'Apollo 11 Moon Landing',
    startYear: 1969,
    endYear: 1969,
    region: 'World',
    summary: 'Six hundred million people watched a human step onto the Moon.',
    tier: 'major',
  },
  {
    id: 'aids-crisis',
    name: 'The AIDS Crisis',
    startYear: 1981,
    endYear: 1996,
    region: 'World',
    summary: 'An epidemic killed hundreds of thousands of Americans while the country was slow to respond.',
    keywords: ['hiv', 'epidemic'],
    tier: 'major',
  },
  {
    id: 'september-11',
    name: 'September 11 Attacks',
    startYear: 2001,
    endYear: 2001,
    region: 'United States',
    summary:
      'Hijacked airliners destroyed the World Trade Center and struck the Pentagon, killing nearly 3,000 people.',
    keywords: ['9/11', 'world trade center'],
    tier: 'major',
  },
] as const;

export function getHistoricalEvent(id: string): HistoricalEvent | undefined {
  return HISTORICAL_EVENTS.find((event) => event.id === id);
}

const EVENT_COLUMNS =
  'id, name, start_year, end_year, region, summary, keywords, tier, geo_scope, lens_affinity';

/**
 * The library is served from the database so new events reach every user
 * without an app update; the bundled list above is the fallback when
 * offline or before the table exists. Slugs are the stable contract.
 */
export async function fetchHistoricalEvents(client: {
  from: (table: string) => any;
}): Promise<readonly HistoricalEvent[]> {
  try {
    const { data, error } = await client
      .from('historical_events')
      .select(EVENT_COLUMNS)
      .order('sort_order');
    if (error || !data?.length) return HISTORICAL_EVENTS;
    return data.map(rowToEvent);
  } catch {
    return HISTORICAL_EVENTS;
  }
}

/** One event by slug, DB-first with bundled fallback. */
export async function fetchHistoricalEvent(
  client: { from: (table: string) => any },
  id: string,
): Promise<HistoricalEvent | undefined> {
  try {
    const { data } = await client
      .from('historical_events')
      .select(EVENT_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (data) return rowToEvent(data);
  } catch {
    // fall through to the bundled library
  }
  return getHistoricalEvent(id);
}

interface EventRow {
  id: string;
  name: string;
  start_year: number;
  end_year: number;
  region: string;
  summary: string;
  keywords: string[] | null;
  tier?: EventTier | null;
  geo_scope?: { regions?: string[] } | null;
  lens_affinity?: string[] | null;
}

function rowToEvent(row: EventRow): HistoricalEvent {
  return {
    id: row.id,
    name: row.name,
    startYear: row.start_year,
    endYear: row.end_year,
    region: row.region,
    summary: row.summary,
    keywords: row.keywords ?? undefined,
    // Rows written before the curation migration default to major/global.
    tier: row.tier ?? 'major',
    geoScope: row.geo_scope?.regions?.length ? { regions: row.geo_scope.regions } : undefined,
    lensAffinity: row.lens_affinity?.length ? row.lens_affinity : undefined,
  };
}

/** Case-insensitive match across name, region, summary, and keywords. */
export function eventMatchesSearch(event: HistoricalEvent, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [
    event.name,
    event.region,
    event.summary,
    String(event.startYear),
    String(event.endYear),
    ...(event.keywords ?? []),
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}
