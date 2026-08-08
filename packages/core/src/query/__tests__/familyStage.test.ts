import { describe, expect, it } from 'vitest';
import {
  buildFamilyStages,
  stageKeyForPerson,
  type StageBond,
  type StagePerson,
} from '../familyStage.js';
import type { TreeIndex, TreeIndividual } from '../treeIndex.js';

const YEAR = 2026;

function person(overrides: Partial<TreeIndividual> & { id: string }): TreeIndividual {
  return {
    full_name: overrides.id,
    given_name: null,
    surname: null,
    sex: 'U',
    birth_year: null,
    death_year: null,
    living: false,
    ...overrides,
  };
}

function makeIndex(
  individuals: TreeIndividual[],
  families: { id: string; husband_id?: string; wife_id?: string; marriage_year: number | null; children?: string[] }[],
): TreeIndex {
  return {
    individuals: new Map(individuals.map((i) => [i.id, i])),
    families: families.map((f) => ({
      id: f.id,
      husband_id: f.husband_id ?? null,
      wife_id: f.wife_id ?? null,
      marriage_year: f.marriage_year,
      marriage_place_id: null,
      children: f.children ?? [],
    })),
    events: [],
    places: new Map(),
  };
}

const build = (index: TreeIndex) => buildFamilyStages(index, { currentYear: YEAR });

describe('buildFamilyStages', () => {
  it('lays out a remarriage as spouse1, bond, head, bond, spouse2 with captions', () => {
    const index = makeIndex(
      [
        person({ id: 'head', full_name: 'Josiah Haskell', surname: 'Haskell', sex: 'M', birth_year: 1700, death_year: 1770 }),
        person({ id: 'w1', full_name: 'Mary Beliveau', surname: 'Beliveau', sex: 'F', birth_year: 1705, death_year: 1740 }),
        person({ id: 'w2', full_name: 'Ann Marsh', surname: 'Marsh', sex: 'F', birth_year: 1715, death_year: 1780 }),
        person({ id: 'c1', sex: 'F', birth_year: 1730, death_year: 1800 }),
        person({ id: 'c2', sex: 'M', birth_year: 1745, death_year: 1810 }),
      ],
      [
        { id: 'f1', husband_id: 'head', wife_id: 'w1', marriage_year: 1728, children: ['c1'] },
        { id: 'f2', husband_id: 'head', wife_id: 'w2', marriage_year: 1742, children: ['c2'] },
      ],
    );
    const { byKey } = build(index);
    const stage = byKey.get('head')!;
    expect(stage.title).toBe('The house of Josiah Haskell and Mary Beliveau, then Ann Marsh');
    expect(stage.label).toBe('Haskell · Beliveau');
    const shape = stage.rows.map((row) =>
      row.kind === 'person' ? `${row.role}:${row.id}` : row.kind === 'bond' ? `bond${row.bond}` : 'caption',
    );
    expect(shape).toEqual([
      'spouse:w1', 'bond1', 'head:head', 'bond2', 'spouse:w2',
      'caption', 'child:c1', 'caption', 'child:c2',
    ]);
  });

  it('closes a bond at the earlier death and lengths the note', () => {
    const index = makeIndex(
      [
        person({ id: 'head', sex: 'M', birth_year: 1700, death_year: 1770 }),
        person({ id: 'w', sex: 'F', birth_year: 1705, death_year: 1740 }),
        person({ id: 'c', birth_year: 1730, death_year: 1790 }),
      ],
      [{ id: 'f1', husband_id: 'head', wife_id: 'w', marriage_year: 1728, children: ['c'] }],
    );
    const stage = build(index).byKey.get('head')!;
    const bond = stage.rows.find((row): row is StageBond => row.kind === 'bond')!;
    expect(bond.to).toBe(1740); // wife dies first — widowhood is the ribbon running past this
    expect(bond.note).toBe('married 1728 · 12 years');
  });

  it('leaves bonds and scrub open around living people', () => {
    const index = makeIndex(
      [
        person({ id: 'head', sex: 'M', birth_year: 1940, living: true }),
        person({ id: 'w', sex: 'F', birth_year: 1945, living: true }),
        person({ id: 'c', birth_year: 1970, living: true }),
      ],
      [{ id: 'f1', husband_id: 'head', wife_id: 'w', marriage_year: 1965, children: ['c'] }],
    );
    const stage = build(index).byKey.get('head')!;
    const bond = stage.rows.find((row): row is StageBond => row.kind === 'bond')!;
    expect(bond.to).toBeNull();
    expect(bond.note).toBe('married 1965');
    expect(stage.scrubEnd).toBe(YEAR);
    expect(stage.hasLiving).toBe(true);
    const child = stage.rows.find(
      (row): row is StagePerson => row.kind === 'person' && row.role === 'child',
    )!;
    expect(child.d).toBeNull();
    expect(child.living).toBe(true);
  });

  it('ends the scrub at the last SURVIVING child, not the last-born', () => {
    const index = makeIndex(
      [
        person({ id: 'head', sex: 'M', birth_year: 1800, death_year: 1860 }),
        person({ id: 'w', sex: 'F', birth_year: 1805, death_year: 1870 }),
        person({ id: 'early', birth_year: 1830, death_year: 1900 }),
        person({ id: 'lastBorn', birth_year: 1845, death_year: 1846 }), // died in infancy
      ],
      [{ id: 'f1', husband_id: 'head', wife_id: 'w', marriage_year: 1828, children: ['early', 'lastBorn'] }],
    );
    const stage = build(index).byKey.get('head')!;
    expect(stage.scrubEnd).toBe(1900); // early outlived the last-born
  });

  it('links a married child onward to their own stage', () => {
    const index = makeIndex(
      [
        person({ id: 'head', sex: 'M', birth_year: 1700, death_year: 1770 }),
        person({ id: 'w', sex: 'F', birth_year: 1705, death_year: 1775 }),
        person({ id: 'ruth', full_name: 'Ruth', sex: 'F', birth_year: 1730, death_year: 1800 }),
        person({ id: 'groom', full_name: 'Israel', sex: 'M', birth_year: 1725, death_year: 1795 }),
        person({ id: 'gc', birth_year: 1755, death_year: 1820 }),
      ],
      [
        { id: 'f1', husband_id: 'head', wife_id: 'w', marriage_year: 1728, children: ['ruth'] },
        { id: 'f2', husband_id: 'groom', wife_id: 'ruth', marriage_year: 1752, children: ['gc'] },
      ],
    );
    const { byKey } = build(index);
    const stage = byKey.get('head')!;
    const ruth = stage.rows.find(
      (row): row is StagePerson => row.kind === 'person' && row.id === 'ruth',
    )!;
    expect(ruth.m).toEqual({ y: 1752, spouse: 'Israel', n: 1 });
    expect(ruth.mfam).toBeDefined();
    expect(byKey.get(ruth.mfam!)).toBeDefined();
  });

  it('keeps unknown-death distinct from living and picker to eight', () => {
    const individuals: TreeIndividual[] = [];
    const families = [];
    for (let i = 0; i < 12; i++) {
      individuals.push(
        person({ id: `h${i}`, sex: 'M', birth_year: 1700, death_year: 1770 }),
        person({ id: `w${i}`, sex: 'F', birth_year: 1705, death_year: 1760 }),
        person({ id: `c${i}`, birth_year: 1730, death_year: i === 0 ? null : 1790 }),
      );
      families.push({ id: `f${i}`, husband_id: `h${i}`, wife_id: `w${i}`, marriage_year: 1725, children: [`c${i}`] });
    }
    const { topLevel, byKey } = build(makeIndex(individuals, families));
    expect(topLevel).toHaveLength(8);
    const openChild = byKey
      .get('h0')!
      .rows.find((row): row is StagePerson => row.kind === 'person' && row.id === 'c0')!;
    expect(openChild.d).toBeNull();
    expect(openChild.living).toBe(false); // open ribbon, but NOT living
  });
});

describe('stageKeyForPerson', () => {
  // A screen that knows only a person — the Portrait — cannot derive the stage
  // key, because the key is the HEAD's id and the head is whichever spouse has
  // the most marriages. Before this resolver a wife's own id missed every key
  // and the caller silently landed the reader on the root family instead.
  const index = makeIndex(
    [
      person({ id: 'head', full_name: 'Josiah Haskell', sex: 'M', birth_year: 1700, death_year: 1770 }),
      person({ id: 'wife', full_name: 'Mary Beliveau', sex: 'F', birth_year: 1705, death_year: 1780 }),
      person({ id: 'child', sex: 'F', birth_year: 1730, death_year: 1800 }),
      person({ id: 'nobody', full_name: 'Unwed Cousin', birth_year: 1740, death_year: 1800 }),
    ],
    [{ id: 'f1', husband_id: 'head', wife_id: 'wife', marriage_year: 1728, children: ['child'] }],
  );

  it('resolves the head to their own stage', () => {
    expect(stageKeyForPerson(build(index), 'head')).toBe('head');
  });

  it('resolves a spouse to the household she is a parent in', () => {
    expect(stageKeyForPerson(build(index), 'wife')).toBe('head');
  });

  it('returns null for someone who heads no household', () => {
    // The caller's cue to render no link at all — a wrong household is worse
    // than no door.
    expect(stageKeyForPerson(build(index), 'nobody')).toBeNull();
    expect(stageKeyForPerson(build(index), 'child')).toBeNull();
  });
});
