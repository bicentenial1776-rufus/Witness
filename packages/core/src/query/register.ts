import type { FamilyStage, FamilyStageIndex, StagePerson } from './familyStage.js';
import type { TreeIndex } from './treeIndex.js';

/**
 * The Register: the table of contents for the Family Stage. Print never
 * navigates by diagram — it navigates by register, index, and serial.
 * One entry per stage-able household, orderable three ways (time, name,
 * place), plus THREADS: chains of stages linked by follow-child doors,
 * the tree flattened into reading paths.
 */

export interface RegisterEntry {
  key: string;
  year: number;
  /** The head's individual id — the stage key is the head. */
  headId: string;
  headName: string;
  spouseLine: string; // "Mary Beliveau" or "Mary Beliveau, then Ann Marsh"
  surname: string;
  childCount: number;
  remarriage: boolean;
  /** Marriage place, shortened to its most local part. */
  place: string | null;
  placeFull: string | null;
  span: string; // "1729–1837"
}

export interface RegisterThread {
  surname: string;
  /** Stage keys, eldest household first. */
  keys: string[];
  startYear: number;
  endYear: number;
}

export interface Register {
  entries: RegisterEntry[]; // time-ordered
  threads: RegisterThread[]; // longest first
  startYear: number;
  endYear: number;
}

function personsOf(stage: FamilyStage): StagePerson[] {
  return stage.rows.filter((row): row is StagePerson => row.kind === 'person');
}

export function buildRegister(index: TreeIndex, stages: FamilyStageIndex): Register {
  const entries: RegisterEntry[] = [];

  for (const stage of stages.byKey.values()) {
    const persons = personsOf(stage);
    const head = persons.find((p) => p.role === 'head');
    if (!head) continue;
    const headPerson = index.individuals.get(stage.key);
    const spouses = persons.filter((p) => p.role === 'spouse');
    const children = persons.filter((p) => p.role === 'child');

    // Marriage place: the head's earliest dated family that recorded one.
    const family = index.families
      .filter(
        (f) =>
          f.marriage_year !== null && (f.husband_id === stage.key || f.wife_id === stage.key),
      )
      .sort((a, b) => (a.marriage_year ?? 0) - (b.marriage_year ?? 0))[0];
    const place = family?.marriage_place_id ? index.places.get(family.marriage_place_id) : undefined;

    entries.push({
      key: stage.key,
      year: stage.marriage,
      headId: stage.key,
      headName: head.n,
      spouseLine: spouses.map((s) => s.n).join(', then ') || 'a spouse unrecorded',
      surname: headPerson?.surname ?? head.n.split(' ').pop() ?? '?',
      childCount: children.length,
      remarriage: spouses.length > 1,
      place: place ? (place.parts[0] ?? place.raw) : null,
      placeFull: place?.raw ?? null,
      span: `${stage.scrubStart}–${stage.scrubEnd}`,
    });
  }

  entries.sort((a, b) => a.year - b.year || a.surname.localeCompare(b.surname));

  return {
    entries,
    threads: buildThreads(index, stages),
    startYear: entries[0]?.year ?? 0,
    endYear: entries[entries.length - 1]?.year ?? 0,
  };
}

/**
 * A thread follows the doors: stage → a child who heads their own stage.
 * Edges are restricted to children who CARRY the household (they head
 * the next unit themselves), which is what makes the chain read as one
 * line. Longest path from each root, deduped so a household appears in
 * only its longest thread.
 */
function buildThreads(index: TreeIndex, stages: FamilyStageIndex): RegisterThread[] {
  const edges = new Map<string, string[]>();
  const hasIncoming = new Set<string>();
  for (const stage of stages.byKey.values()) {
    for (const child of personsOf(stage).filter((p) => p.role === 'child')) {
      if (!child.mfam || child.mfam === stage.key) continue;
      if (child.mfam !== child.id) continue; // the child heads the next unit themselves
      if (!stages.byKey.has(child.mfam)) continue;
      if (!edges.has(stage.key)) edges.set(stage.key, []);
      edges.get(stage.key)!.push(child.mfam);
      hasIncoming.add(child.mfam);
    }
  }

  // Longest chain from each root (the data is generational, but guard
  // against merge-corrupted cycles anyway).
  const longestFrom = new Map<string, string[]>();
  function walk(key: string, seen: Set<string>): string[] {
    if (seen.has(key)) return [];
    const cached = longestFrom.get(key);
    if (cached) return cached;
    seen.add(key);
    let best: string[] = [];
    for (const next of edges.get(key) ?? []) {
      const chain = walk(next, seen);
      if (chain.length > best.length) best = chain;
    }
    seen.delete(key);
    const result = [key, ...best];
    longestFrom.set(key, result);
    return result;
  }

  const claimed = new Set<string>();
  const threads: RegisterThread[] = [];
  const roots = [...stages.byKey.keys()].filter((key) => !hasIncoming.has(key));
  const chains = roots
    .map((root) => walk(root, new Set()))
    .filter((chain) => chain.length >= 3)
    .sort((a, b) => b.length - a.length);

  for (const chain of chains) {
    if (chain.some((key) => claimed.has(key))) continue;
    chain.forEach((key) => claimed.add(key));
    const first = stages.byKey.get(chain[0]!)!;
    const last = stages.byKey.get(chain[chain.length - 1]!)!;
    const surname = index.individuals.get(chain[0]!)?.surname ?? '?';
    threads.push({
      surname,
      keys: chain,
      startYear: first.marriage,
      endYear: last.scrubEnd,
    });
  }

  return threads.sort((a, b) => b.keys.length - a.keys.length).slice(0, 8);
}
