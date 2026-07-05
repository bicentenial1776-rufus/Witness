/**
 * Curated historical event library for temporal queries ("who was alive
 * during X?"). Hand-authored: these are the prompt cards the app ships
 * with, ordered chronologically. Ranges use inclusive years; single-year
 * moments set startYear === endYear.
 */

export interface HistoricalEvent {
  /** Stable slug used in routes and caching keys. Never reuse or rename. */
  id: string;
  name: string;
  startYear: number;
  endYear: number;
  /** Coarse geographic scope shown on the prompt card. */
  region: string;
  /** One-sentence framing for the prompt card and results header. */
  summary: string;
  /** Extra search terms beyond the visible text ("mayflower", "cajun"). */
  keywords?: string[];
}

export const HISTORICAL_EVENTS: readonly HistoricalEvent[] = [
  {
    id: 'mayflower-landing',
    name: 'The Mayflower Lands',
    startYear: 1620,
    endYear: 1620,
    region: 'New England',
    summary: 'The Pilgrims anchored off Cape Cod and founded Plymouth Colony.',
  },
  {
    id: 'king-philips-war',
    name: "King Philip's War",
    startYear: 1675,
    endYear: 1678,
    region: 'New England',
    summary:
      'The deadliest war per capita in American colonial history swept through the towns of New England.',
  },
  {
    id: 'salem-witch-trials',
    name: 'Salem Witch Trials',
    startYear: 1692,
    endYear: 1693,
    region: 'New England',
    summary: 'Accusations of witchcraft consumed Salem and the surrounding Massachusetts villages.',
  },
  {
    id: 'french-and-indian-war',
    name: 'French and Indian War',
    startYear: 1754,
    endYear: 1763,
    region: 'North America',
    summary: 'Britain and France fought for the continent, drawing colonial militias into the frontier.',
  },
  {
    id: 'grand-derangement',
    name: 'Le Grand Dérangement',
    startYear: 1755,
    endYear: 1764,
    region: 'Acadia',
    summary: 'The British expelled the Acadian people from their homeland, scattering families across the Atlantic world.',
  },
  {
    id: 'boston-tea-party',
    name: 'Boston Tea Party',
    startYear: 1773,
    endYear: 1773,
    region: 'New England',
    summary: 'Colonists dumped 342 chests of British tea into Boston Harbor.',
  },
  {
    id: 'american-revolution',
    name: 'American Revolution',
    startYear: 1775,
    endYear: 1783,
    region: 'North America',
    summary: 'Thirteen colonies fought an eight-year war for independence.',
  },
  {
    id: 'declaration-of-independence',
    name: 'Signing of the Declaration of Independence',
    startYear: 1776,
    endYear: 1776,
    region: 'North America',
    summary: 'The colonies declared themselves free and independent states.',
  },
  {
    id: 'constitution-ratified',
    name: 'Ratification of the Constitution',
    startYear: 1788,
    endYear: 1788,
    region: 'United States',
    summary: 'The United States adopted the framework of government still in force today.',
  },
  {
    id: 'louisiana-purchase',
    name: 'Louisiana Purchase',
    startYear: 1803,
    endYear: 1803,
    region: 'United States',
    summary: 'The nation doubled in size overnight for fifteen million dollars.',
  },
  {
    id: 'war-of-1812',
    name: 'War of 1812',
    startYear: 1812,
    endYear: 1815,
    region: 'North America',
    summary: 'The young republic fought Britain again, from the Great Lakes to a burning Washington.',
  },
  {
    id: 'erie-canal',
    name: 'Opening of the Erie Canal',
    startYear: 1825,
    endYear: 1825,
    region: 'United States',
    summary: 'A 363-mile canal linked the Atlantic to the Great Lakes and pulled migration westward.',
  },
  {
    id: 'irish-famine',
    name: 'The Great Famine',
    startYear: 1845,
    endYear: 1852,
    region: 'Ireland',
    summary: 'Famine killed a million people in Ireland and drove two million more to emigrate.',
  },
  {
    id: 'california-gold-rush',
    name: 'California Gold Rush',
    startYear: 1848,
    endYear: 1855,
    region: 'United States',
    summary: 'Three hundred thousand people raced to California in search of gold.',
  },
  {
    id: 'civil-war',
    name: 'American Civil War',
    startYear: 1861,
    endYear: 1865,
    region: 'United States',
    summary: 'The war between North and South touched nearly every American family.',
  },
  {
    id: 'lincoln-assassination',
    name: 'Assassination of Abraham Lincoln',
    startYear: 1865,
    endYear: 1865,
    region: 'United States',
    summary: 'Five days after Appomattox, the president was shot at Ford’s Theatre.',
  },
  {
    id: 'transcontinental-railroad',
    name: 'Completion of the Transcontinental Railroad',
    startYear: 1869,
    endYear: 1869,
    region: 'United States',
    summary: 'A golden spike at Promontory Summit joined the coasts by rail.',
  },
  {
    id: 'great-chicago-fire',
    name: 'Great Chicago Fire',
    startYear: 1871,
    endYear: 1871,
    region: 'United States',
    summary: 'Fire destroyed three square miles of Chicago and left a third of the city homeless.',
  },
  {
    id: 'ellis-island-opens',
    name: 'Opening of Ellis Island',
    startYear: 1892,
    endYear: 1892,
    region: 'United States',
    summary: 'The great gateway of American immigration opened in New York Harbor.',
  },
  {
    id: 'san-francisco-earthquake',
    name: 'San Francisco Earthquake',
    startYear: 1906,
    endYear: 1906,
    region: 'United States',
    summary: 'Earthquake and fire destroyed most of San Francisco in three days.',
  },
  {
    id: 'titanic',
    name: 'Sinking of the Titanic',
    startYear: 1912,
    endYear: 1912,
    region: 'World',
    summary: 'The unsinkable ship went down in the North Atlantic on its maiden voyage.',
  },
  {
    id: 'world-war-i',
    name: 'World War I',
    startYear: 1914,
    endYear: 1918,
    region: 'World',
    summary: 'The Great War drew millions of Americans into the trenches of Europe.',
  },
  {
    id: 'influenza-1918',
    name: '1918 Influenza Pandemic',
    startYear: 1918,
    endYear: 1920,
    region: 'World',
    summary: 'A pandemic killed more people than the war it followed.',
  },
  {
    id: 'womens-suffrage',
    name: 'Ratification of the 19th Amendment',
    startYear: 1920,
    endYear: 1920,
    region: 'United States',
    summary: 'American women won the constitutional right to vote.',
  },
  {
    id: 'great-depression',
    name: 'Great Depression',
    startYear: 1929,
    endYear: 1939,
    region: 'World',
    summary: 'A decade of economic collapse reshaped how a generation lived and worked.',
  },
  {
    id: 'world-war-ii',
    name: 'World War II',
    startYear: 1939,
    endYear: 1945,
    region: 'World',
    summary: 'The largest war in human history reached into every American town.',
  },
  {
    id: 'moon-landing',
    name: 'Apollo 11 Moon Landing',
    startYear: 1969,
    endYear: 1969,
    region: 'World',
    summary: 'Six hundred million people watched a human step onto the Moon.',
  },
] as const;

export function getHistoricalEvent(id: string): HistoricalEvent | undefined {
  return HISTORICAL_EVENTS.find((event) => event.id === id);
}

/**
 * The library is served from the database so new prompt cards reach every
 * user without an app update; the bundled list above is the fallback when
 * offline or before the table exists. Slugs are the stable contract.
 */
export async function fetchHistoricalEvents(client: {
  from: (table: string) => any;
}): Promise<readonly HistoricalEvent[]> {
  try {
    const { data, error } = await client
      .from('historical_events')
      .select('id, name, start_year, end_year, region, summary, keywords')
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
      .select('id, name, start_year, end_year, region, summary, keywords')
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
  };
}

/** Case-insensitive match across name, region, summary, and keywords. */
export function eventMatchesSearch(event: HistoricalEvent, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [event.name, event.region, event.summary, ...(event.keywords ?? [])]
    .join(' ')
    .toLowerCase()
    .includes(q);
}
