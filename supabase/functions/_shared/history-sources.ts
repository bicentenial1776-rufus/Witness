// External history sources for context enrichment. Both are free APIs
// from the brief's V1 integration list. Failures degrade gracefully —
// enrichment proceeds with whatever sources answered.

/** Wikidata entity ids for the countries that dominate genealogy trees. */
const WIKIDATA_COUNTRIES: Record<string, string> = {
  'United States': 'Q30',
  England: 'Q21',
  Scotland: 'Q22',
  Wales: 'Q25',
  'United Kingdom': 'Q145',
  Ireland: 'Q22890',
  Canada: 'Q16',
  France: 'Q142',
  Germany: 'Q183',
  Netherlands: 'Q55',
};

export interface HistoricalEventFact {
  label: string;
  year: number;
}

/**
 * Wars, epidemics, and disasters in the ancestor's country during their
 * lifetime, from Wikidata's structured data.
 */
export async function fetchWikidataEvents(
  country: string | null,
  startYear: number,
  endYear: number,
): Promise<HistoricalEventFact[]> {
  const entity = country ? WIKIDATA_COUNTRIES[country] : null;
  if (!entity) return [];

  const sparql = `
    SELECT DISTINCT ?event ?eventLabel ?date WHERE {
      VALUES ?type { wd:Q198 wd:Q3241045 wd:Q8065 wd:Q124734 }
      ?event wdt:P31 ?type .
      ?event wdt:P17 wd:${entity} .
      ?event wdt:P580|wdt:P585 ?date .
      FILTER(YEAR(?date) >= ${startYear} && YEAR(?date) <= ${endYear})
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
    } LIMIT 60`;

  try {
    const response = await fetch(
      `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`,
      {
        headers: { 'User-Agent': 'Witness/0.1 (family history app; witnesslives.com)' },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) return [];
    const body = await response.json();
    const byLabel = new Map<string, number>();
    for (const row of body.results?.bindings ?? []) {
      const label: string | undefined = row.eventLabel?.value;
      const year = row.date?.value ? new Date(row.date.value).getUTCFullYear() : null;
      if (!label || !year || /^Q\d+$/.test(label)) continue;
      if (!byLabel.has(label) || byLabel.get(label)! > year) byLabel.set(label, year);
    }
    return [...byLabel.entries()]
      .map(([label, year]) => ({ label, year }))
      .sort((a, b) => a.year - b.year)
      .slice(0, 15);
  } catch (error) {
    console.error('Wikidata lookup failed:', error);
    return [];
  }
}

export interface NewspaperSnippet {
  title: string;
  date: string;
  snippet: string;
}

/**
 * Local newspaper snippets from the Library of Congress's Chronicling
 * America archive (US papers, roughly 1770–1963). OCR text is noisy;
 * we pass short excerpts and let the model treat them as texture.
 */
export async function fetchChroniclingAmerica(
  town: string | null,
  state: string | null,
  startYear: number,
  endYear: number,
): Promise<NewspaperSnippet[]> {
  if (!town && !state) return [];
  const from = Math.max(startYear, 1770);
  const to = Math.min(endYear, 1963);
  if (from > to) return [];

  const params = new URLSearchParams({
    date1: String(from),
    date2: String(to),
    dateFilterType: 'yearRange',
    rows: '4',
    format: 'json',
  });
  if (town) params.set('andtext', town);
  if (state) params.set('state', state);

  try {
    const response = await fetch(
      `https://chroniclingamerica.loc.gov/search/pages/results/?${params}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) return [];
    const body = await response.json();
    return (body.items ?? []).slice(0, 4).map(
      (item: { title: string; date: string; ocr_eng?: string }) => ({
        title: item.title,
        date: item.date,
        snippet: (item.ocr_eng ?? '').replace(/\s+/g, ' ').slice(0, 400),
      }),
    );
  } catch (error) {
    console.error('Chronicling America lookup failed:', error);
    return [];
  }
}
