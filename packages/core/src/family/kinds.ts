/**
 * Relatives by kind, and ancestors a generation at a time — two readings
 * of the same precomputed relationship rows, for a reader who said
 * (2026-09-06) "when I see that everyone has 128 fifth great-grandparents
 * I know I am too deep… if I could see just 3 generations back that would
 * be manageable. Or one generation at a time." Pure: hand in the rows,
 * get back groups.
 */

export interface KinRow {
  individual_id: string;
  label: string;
  generation_distance: number;
  line: string;
  is_direct_ancestor: boolean;
}

export interface KinKind {
  /** Stable key, e.g. 'ancestors-3', 'cousins-1', 'spouse:aunts-1'. */
  key: string;
  /** Plural heading, e.g. "Great-grandparents", "1st cousins". */
  title: string;
  /** Closer kinds first. */
  order: number;
}

export interface KinGroup extends KinKind {
  ids: string[];
}

export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const rem10 = n % 10;
  return `${n}${rem10 === 1 ? 'st' : rem10 === 2 ? 'nd' : rem10 === 3 ? 'rd' : 'th'}`;
}

const REMOVED = /^(?:once|twice|thrice|\d+ times) removed$/;

function ancestorTitle(n: number): string {
  return n === 1 ? 'Parents' : n === 2 ? 'Grandparents' : n === 3 ? 'Great-grandparents' : `${ordinal(n - 2)} great-grandparents`;
}
function descendantTitle(n: number): string {
  return n === 1 ? 'Children' : n === 2 ? 'Grandchildren' : n === 3 ? 'Great-grandchildren' : `${ordinal(n - 2)} great-grandchildren`;
}
function auntTitle(g: number): string {
  return g === 1 ? 'Aunts & uncles' : g === 2 ? 'Great-aunts & uncles' : `${ordinal(g - 1)} great-aunts & uncles`;
}
function nieceTitle(g: number): string {
  return g === 1 ? 'Nieces & nephews' : g === 2 ? 'Great-nieces & nephews' : `${ordinal(g - 1)} great-nieces & nephews`;
}

/** The generation count hidden in "3rd great-grandmother" (5), "grandfather" (2), "father" (1). */
function lineDepth(prefixWords: string[]): number | null {
  // prefixWords is everything before the root word, e.g. ['3rd', 'great-grand'] or ['grand'] or [].
  if (prefixWords.length === 0) return 1;
  const joined = prefixWords.join(' ');
  if (joined === 'grand') return 2;
  if (joined === 'great-grand') return 3;
  const m = /^(\d+)(?:st|nd|rd|th) great-grand$/.exec(joined);
  if (m) return Number(m[1]) + 2;
  return null;
}

/**
 * The kind a label belongs to. Unknown shapes land in "Other relatives"
 * rather than being dropped — a label the engine produced is a real
 * relationship even when this reader has no shelf for it.
 */
export function classifyLabel(rawLabel: string): KinKind {
  let label = rawLabel.trim().toLowerCase();

  // A spouse's relative: classify what follows and file it under the spouse.
  const spouse = /^your (wife|husband|spouse)'s (.+)$/.exec(label);
  if (spouse) {
    const inner = classifyLabel(spouse[2]!);
    const whose = `Your ${spouse[1]}'s`;
    return { key: `spouse:${inner.key}`, title: `${whose} ${inner.title.charAt(0).toLowerCase()}${inner.title.slice(1)}`, order: 1000 + inner.order };
  }

  // Softeners and qualifiers describe the link, not the kind.
  label = label.replace(/^possibly an? /, '').replace(/^(half-|adoptive |adopted |foster )+/, '');
  // "3rd cousin — also your wife": the blood kind leads.
  label = label.split(' — ')[0]!.trim();

  if (/^(wife|husband|spouse)$/.test(label)) return { key: 'spouse', title: 'Spouse', order: 1 };
  if (/-in-law$/.test(label)) return { key: 'in-laws', title: 'In-laws', order: 900 };
  if (/^step/.test(label)) return { key: 'step-family', title: 'Step-family', order: 910 };
  // Closeness: parents 10, siblings 11, children 12, then each generation
  // out: ancestors 10n, descendants 10n+2, aunts 10(g+1)+3, nieces 10(g+1)+4,
  // cousins 10(d+2)+5 — so first cousins sit just past the great-aunts.
  if (/^(brother|sister|sibling)$/.test(label)) return { key: 'siblings', title: 'Brothers & sisters', order: 11 };

  // Ancestors and descendants: "[3rd ]great-grand|grand|∅ + root".
  const lineage = /^(?:((?:\d+(?:st|nd|rd|th) )?great-grand|grand) ?)?(father|mother|parent|son|daughter|child)$/.exec(label.replace('great-grand', 'great-grand '));
  if (lineage) {
    const prefix = (lineage[1] ?? '').trim();
    const depth = lineDepth(prefix ? prefix.split(' ') : []);
    const root = lineage[2]!;
    const up = root === 'father' || root === 'mother' || root === 'parent';
    if (depth !== null) {
      return up
        ? { key: `ancestors-${depth}`, title: ancestorTitle(depth), order: 10 * depth }
        : { key: `descendants-${depth}`, title: descendantTitle(depth), order: 10 * depth + 2 };
    }
  }

  // Aunts/uncles and nieces/nephews: "[Nth ]great-uncle" (N+1 generations up), "great-aunt" (2), "aunt" (1).
  const collateral = /^(?:(\d+)(?:st|nd|rd|th) )?(great-)?(uncle|aunt|aunt\/uncle|nephew|niece|niece\/nephew)$/.exec(label);
  if (collateral) {
    const n = collateral[1] ? Number(collateral[1]) + 1 : collateral[2] ? 2 : 1;
    const isAunt = /uncle|aunt/.test(collateral[3]!);
    return isAunt
      ? { key: `aunts-${n}`, title: auntTitle(n), order: 10 * (n + 1) + 3 }
      : { key: `nieces-${n}`, title: nieceTitle(n), order: 10 * (n + 1) + 4 };
  }

  // Cousins by degree. "First cousins" means first cousins proper; the
  // once/twice removed sit on their own shelf just after.
  const cousin = /^(\d+)(?:st|nd|rd|th) cousin(?: (.+))?$/.exec(label);
  if (cousin && (!cousin[2] || REMOVED.test(cousin[2]))) {
    const degree = Number(cousin[1]);
    const base = 10 * (degree + 2) + 5;
    return cousin[2]
      ? { key: `cousins-${degree}-removed`, title: `${ordinal(degree)} cousins, removed`, order: base + 1 }
      : { key: `cousins-${degree}`, title: `${ordinal(degree)} cousins`, order: base };
  }

  return { key: 'other', title: 'Other relatives', order: 990 };
}

/** Every kind present, closest first, each with the people in it. */
export function groupByKind(rows: KinRow[]): KinGroup[] {
  const groups = new Map<string, KinGroup>();
  for (const row of rows) {
    const kind = classifyLabel(row.label);
    let group = groups.get(kind.key);
    if (!group) {
      group = { ...kind, ids: [] };
      groups.set(kind.key, group);
    }
    group.ids.push(row.individual_id);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export interface Generation {
  /** 1 = parents, 2 = grandparents … */
  n: number;
  title: string;
  /** 2^n — how many slots the generation has. */
  expected: number;
  paternal: string[];
  maternal: string[];
  /** Ancestors the walk could not place on a side (line unknown/both). */
  unplaced: string[];
}

/**
 * Direct ancestors a generation at a time, closest first, each split by
 * the side of the family. Every generation up to the deepest known is
 * present even when empty, so the walk can say "none recorded" instead
 * of skipping.
 */
export function ancestorGenerations(rows: KinRow[]): Generation[] {
  const byN = new Map<number, Generation>();
  let deepest = 0;
  for (const row of rows) {
    if (!row.is_direct_ancestor || row.generation_distance < 1) continue;
    const n = row.generation_distance;
    deepest = Math.max(deepest, n);
    let generation = byN.get(n);
    if (!generation) {
      generation = { n, title: ancestorTitle(n), expected: 2 ** n, paternal: [], maternal: [], unplaced: [] };
      byN.set(n, generation);
    }
    (row.line === 'paternal' ? generation.paternal : row.line === 'maternal' ? generation.maternal : generation.unplaced).push(
      row.individual_id,
    );
  }
  const generations: Generation[] = [];
  for (let n = 1; n <= deepest; n += 1) {
    generations.push(byN.get(n) ?? { n, title: ancestorTitle(n), expected: 2 ** n, paternal: [], maternal: [], unplaced: [] });
  }
  return generations;
}

export function generationKnown(generation: Generation): number {
  return generation.paternal.length + generation.maternal.length + generation.unplaced.length;
}
