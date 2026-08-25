import { describe, expect, it } from 'vitest';
import { buildGraphFromRows, type FamilyGraph } from '../graph.js';
import { calculateRelationship, parentLine } from '../relationship.js';

/**
 * Compact fixture builder. Spec lines look like:
 *   'F1: husband=A wife=B children=C,D'
 * A child's link type can be qualified for the whole family with
 * `adopted=`, `foster=`, or `step=`, naming children already listed:
 *   'F2: husband=A wife=B children=C adopted=C'
 * Person sex comes from a `sexes` map; everyone else defaults to 'U'.
 */
function makeGraph(familySpecs: string[], sexes: Record<string, 'M' | 'F'> = {}): FamilyGraph {
  const ids = new Set<string>();
  const families = familySpecs.map((spec, index) => {
    const husband = /husband=(\w+)/.exec(spec)?.[1] ?? null;
    const wife = /wife=(\w+)/.exec(spec)?.[1] ?? null;
    const children = /children=([\w,]+)/.exec(spec)?.[1]?.split(',') ?? [];
    for (const id of [husband, wife, ...children]) if (id) ids.add(id);
    const typed = new Map<string, string>();
    for (const type of ['adopted', 'foster', 'step']) {
      for (const id of new RegExp(`${type}=([\\w,]+)`).exec(spec)?.[1]?.split(',') ?? []) {
        typed.set(id, type);
      }
    }
    return { id: `F${index}`, husband_id: husband, wife_id: wife, children, typed };
  });
  const individuals = [...ids].map((id) => ({
    id,
    full_name: id,
    sex: sexes[id] ?? ('U' as const),
    birth_year: null,
    death_year: null,
    living: false,
  }));
  const familyChildren = families.flatMap((f) =>
    f.children.map((c) => ({
      family_id: f.id,
      individual_id: c,
      father_relation: f.typed.get(c) ?? null,
      mother_relation: f.typed.get(c) ?? null,
    })),
  );
  return buildGraphFromRows(individuals, families, familyChildren);
}

// A four-generation stem: GGG couple → GG couple → G couple → parents → HOME
// with an uncle (U), his daughter cousin (C1), and C1's son (C1S).
const STEM = makeGraph(
  [
    'F: husband=GGGF wife=GGGM children=GGF',
    'F: husband=GGF wife=GGM children=GF',
    'F: husband=GF wife=GM children=DAD,U',
    'F: husband=DAD wife=MOM children=HOME,SIB',
    'F: husband=U wife=UW children=C1',
    'F: husband=C1H wife=C1 children=C1S',
    'F: husband=HOME wife=WIFE children=KID',
    'F: husband=KID wife=KIDW children=GKID',
  ],
  { GGGF: 'M', GGGM: 'F', GGM: 'F', GM: 'F', MOM: 'F', DAD: 'M', U: 'M', C1: 'F', WIFE: 'F', KID: 'M', GKID: 'M', SIB: 'F' },
);

describe('direct ancestors', () => {
  it('labels parent through 10th great-grandparent', () => {
    expect(calculateRelationship(STEM, 'HOME', 'DAD').label).toBe('father');
    expect(calculateRelationship(STEM, 'HOME', 'MOM').label).toBe('mother');
    expect(calculateRelationship(STEM, 'HOME', 'GM').label).toBe('grandmother');
    expect(calculateRelationship(STEM, 'HOME', 'GGM').label).toBe('great-grandmother');
    expect(calculateRelationship(STEM, 'HOME', 'GGGM').label).toBe('2nd great-grandmother');
    expect(calculateRelationship(STEM, 'HOME', 'GGGF').label).toBe('2nd great-grandfather');

    // A deep chain: depth 12 = 10th great-grandparent.
    const chainSpecs = Array.from({ length: 12 }, (_, i) => `F: husband=P${i + 1} children=P${i}`);
    const chain = makeGraph(chainSpecs);
    const rel = calculateRelationship(chain, 'P0', 'P12');
    expect(rel.label).toBe('10th great-grandparent');
    expect(rel.generationDistance).toBe(12);
    expect(rel.isDirectAncestor).toBe(true);
    expect(rel.path).toHaveLength(13);
  });

  it('marks maternal vs paternal line by the first step', () => {
    expect(calculateRelationship(STEM, 'HOME', 'GGGM').line).toBe('paternal');
    const maternal = makeGraph(
      ['F: husband=DAD wife=MOM children=HOME', 'F: husband=MGF wife=MGM children=MOM'],
      { MOM: 'F', MGM: 'F' },
    );
    expect(calculateRelationship(maternal, 'HOME', 'MGM').line).toBe('maternal');
    expect(calculateRelationship(maternal, 'HOME', 'MGM').label).toBe('grandmother');
  });
});

describe('direct descendants', () => {
  it('labels child, grandchild, and deeper', () => {
    expect(calculateRelationship(STEM, 'HOME', 'KID').label).toBe('son');
    const rel = calculateRelationship(STEM, 'HOME', 'GKID');
    expect(rel.label).toBe('grandson');
    expect(rel.generationDistance).toBe(-2);
    expect(rel.isDirectDescendant).toBe(true);
  });
});

describe('siblings, aunts, nieces', () => {
  it('labels a full sibling', () => {
    const rel = calculateRelationship(STEM, 'HOME', 'SIB');
    expect(rel.label).toBe('sister');
    expect(rel.isCollateral).toBe(true);
    expect(rel.confidence).toBe('known');
  });

  it('labels a half-sibling when parents share one known parent', () => {
    const graph = makeGraph(
      ['F: husband=DAD wife=MOM1 children=HOME', 'F: husband=DAD wife=MOM2 children=HALF'],
      { HALF: 'M' },
    );
    expect(calculateRelationship(graph, 'HOME', 'HALF').label).toBe('half-brother');
  });

  it('softens to "possibly a half-" when the other parent is unknown', () => {
    const graph = makeGraph(['F: husband=DAD children=HOME,MAYBE'], { MAYBE: 'F' });
    const rel = calculateRelationship(graph, 'HOME', 'MAYBE');
    expect(rel.label).toBe('possibly a half-sister');
    expect(rel.confidence).toBe('partial');
  });

  it('keeps composed married-in labels plain even when the blood part is partial', () => {
    // GF's wife is unrecorded, so DAD vs UNC is full-vs-half undecidable;
    // the softener belongs on UNC's own label, not inside "wife of your …".
    const graph = makeGraph(
      ['F: husband=GF children=DAD,UNC', 'F: husband=DAD wife=MOM children=HOME', 'F: husband=UNC wife=AUNTW children='],
      { UNC: 'M', AUNTW: 'F' },
    );
    expect(calculateRelationship(graph, 'HOME', 'UNC').label).toBe('possibly a half-uncle');
    const married = calculateRelationship(graph, 'HOME', 'AUNTW');
    expect(married.label).toBe('wife of your uncle');
    expect(married.confidence).toBe('partial');
  });

  it('labels aunts and great-aunts up the generations', () => {
    expect(calculateRelationship(STEM, 'HOME', 'U').label).toBe('uncle');
    const graph = makeGraph(
      [
        'F: husband=GGF wife=GGM children=GF,GAUNT',
        'F: husband=GF wife=GM children=DAD',
        'F: husband=DAD wife=MOM children=HOME',
      ],
      { GAUNT: 'F' },
    );
    expect(calculateRelationship(graph, 'HOME', 'GAUNT').label).toBe('great-aunt');
  });

  it('labels nieces and nephews', () => {
    const graph = makeGraph(
      ['F: husband=DAD wife=MOM children=HOME,SIB', 'F: husband=SIB wife=SW children=NEPHEW'],
      { NEPHEW: 'M', SIB: 'M' },
    );
    expect(calculateRelationship(graph, 'HOME', 'NEPHEW').label).toBe('nephew');
  });
});

describe('cousins', () => {
  it('labels 1st cousin', () => {
    const rel = calculateRelationship(STEM, 'HOME', 'C1');
    expect(rel.label).toBe('1st cousin');
    expect(rel.generationDistance).toBe(0);
  });

  it('labels once-removed in both directions', () => {
    // C1S is the son of HOME's 1st cousin.
    expect(calculateRelationship(STEM, 'HOME', 'C1S').label).toBe('1st cousin once removed');
    // And from C1S's perspective, HOME is also 1st cousin once removed.
    expect(calculateRelationship(STEM, 'C1S', 'HOME').label).toBe('1st cousin once removed');
  });

  it('labels 2nd cousins and multiple removals', () => {
    const graph = makeGraph([
      'F: husband=GG wife=GGW children=A1,B1',
      'F: husband=A1 children=A2',
      'F: husband=A2 children=HOME',
      'F: husband=B1 children=B2',
      'F: husband=B2 children=SC',
      'F: husband=SC children=SCK',
      'F: husband=SCK children=SCKK',
    ]);
    expect(calculateRelationship(graph, 'HOME', 'SC').label).toBe('2nd cousin');
    expect(calculateRelationship(graph, 'HOME', 'SCKK').label).toBe('2nd cousin twice removed');
  });

  it('labels half-cousins through a shared single grandparent', () => {
    const graph = makeGraph([
      'F: husband=GF wife=GM1 children=DAD',
      'F: husband=GF wife=GM2 children=HALFUNCLE',
      'F: husband=DAD children=HOME',
      'F: husband=HALFUNCLE children=HALFCOUSIN',
    ]);
    expect(calculateRelationship(graph, 'HOME', 'HALFCOUSIN').label).toBe('half-1st cousin');
  });
});

describe('spouses and in-laws', () => {
  it('labels a spouse by sex', () => {
    expect(calculateRelationship(STEM, 'HOME', 'WIFE').label).toBe('wife');
  });

  it('labels parents-in-law', () => {
    const graph = makeGraph(
      ['F: husband=HOME wife=WIFE children=', 'F: husband=WF wife=WM children=WIFE'],
      { WIFE: 'F', WM: 'F', WF: 'M' },
    );
    expect(calculateRelationship(graph, 'HOME', 'WM').label).toBe('mother-in-law');
    expect(calculateRelationship(graph, 'HOME', 'WF').label).toBe('father-in-law');
  });

  it("labels a sibling's spouse and a child's spouse", () => {
    const graph = makeGraph(
      [
        'F: husband=DAD wife=MOM children=HOME,SIB',
        'F: husband=SIB wife=SIBWIFE children=',
        'F: husband=HOME wife=W children=KID',
        'F: husband=KID wife=KIDWIFE children=',
      ],
      { SIBWIFE: 'F', KIDWIFE: 'F', SIB: 'M', KID: 'M' },
    );
    expect(calculateRelationship(graph, 'HOME', 'SIBWIFE').label).toBe('sister-in-law');
    expect(calculateRelationship(graph, 'HOME', 'KIDWIFE').label).toBe('daughter-in-law');
  });
});

describe('edge cases', () => {
  it('handles the home person themselves', () => {
    const rel = calculateRelationship(STEM, 'HOME', 'HOME');
    expect(rel.label).toBe('this is you');
    expect(rel.path).toEqual(['HOME']);
  });

  it('returns no relationship with confidence none when lines never meet', () => {
    const graph = makeGraph(['F: husband=A children=HOME', 'F: husband=B children=STRANGER']);
    const rel = calculateRelationship(graph, 'HOME', 'STRANGER');
    expect(rel.label).toBe('no known relationship');
    expect(rel.confidence).toBe('none');
    expect(rel.path).toEqual([]);
  });

  it('survives pedigree collapse and picks the shortest path', () => {
    // Cousin marriage: HOME's parents are 1st cousins, so GG is reachable
    // twice. The shortest reading (great-grandparent, depth 3) must win
    // and the line must be 'both'.
    const graph = makeGraph([
      'F: husband=GG wife=GGW children=A,B',
      'F: husband=A children=DAD',
      'F: wife=B children=MOM',
      'F: husband=DAD wife=MOM children=HOME',
    ]);
    const rel = calculateRelationship(graph, 'HOME', 'GG');
    expect(rel.label).toBe('great-grandparent');
    expect(rel.generationDistance).toBe(3);
    expect(rel.line).toBe('both');
  });
});

describe('parentLine', () => {
  it('walks the chain of mothers and stops at unknowns', () => {
    const graph = makeGraph(
      ['F: husband=DAD wife=MOM children=HOME', 'F: husband=MGF wife=MGM children=MOM'],
      { MOM: 'F', MGM: 'F' },
    );
    expect(parentLine(graph, 'HOME', 'mother').map((p) => p.id)).toEqual(['MOM', 'MGM']);
    expect(parentLine(graph, 'HOME', 'father').map((p) => p.id)).toEqual(['DAD']);
  });
});

describe('tiers', () => {
  it('tiers the line, the collaterals, and the married-in', () => {
    expect(calculateRelationship(STEM, 'HOME', 'GF').tier).toBe('direct');
    expect(calculateRelationship(STEM, 'HOME', 'KID').tier).toBe('direct');
    expect(calculateRelationship(STEM, 'HOME', 'U').tier).toBe('blood');
    expect(calculateRelationship(STEM, 'HOME', 'C1').tier).toBe('blood');
    expect(calculateRelationship(STEM, 'HOME', 'WIFE').tier).toBe('distant');
    expect(calculateRelationship(STEM, 'HOME', 'UW').tier).toBe('distant');
  });

  it('gives an unconnected person the none tier and no label', () => {
    const graph = makeGraph(['F: husband=A children=HOME', 'F: husband=B children=STRANGER']);
    const rel = calculateRelationship(graph, 'HOME', 'STRANGER');
    expect(rel.tier).toBe('none');
    expect(rel.path).toEqual([]);
  });
});

describe('married into your line', () => {
  const REMARRIED = makeGraph(
    [
      'F: husband=GGF wife=GGM children=GF',
      'F: husband=GF wife=GM children=DAD',
      'F: husband=GF wife=GF2',
      'F: husband=GGF wife=GGF2',
      'F: husband=DAD wife=MOM children=HOME',
    ],
    { GF2: 'F', GGF2: 'F', GM: 'F', MOM: 'F', GF: 'M', GGF: 'M', DAD: 'M' },
  );

  it('names a grandfather\'s later wife a step-grandmother', () => {
    const rel = calculateRelationship(REMARRIED, 'HOME', 'GF2');
    expect(rel.label).toBe('step-grandmother');
    expect(rel.tier).toBe('distant');
  });

  it('composes past the step range', () => {
    expect(calculateRelationship(REMARRIED, 'HOME', 'GGF2').label).toBe(
      'wife of your great-grandfather',
    );
  });

  it('keeps the in-law words where English has them', () => {
    const graph = makeGraph(
      [
        'F: husband=PIL wife=MIL children=WIFE,SIL',
        'F: husband=HOME wife=WIFE children=KID',
        'F: husband=KID wife=KIDW',
        'F: husband=DAD children=HOME,SIB',
        'F: husband=SIBH wife=SIB',
      ],
      { PIL: 'M', MIL: 'F', WIFE: 'F', SIL: 'F', KIDW: 'F', SIB: 'F', SIBH: 'M' },
    );
    expect(calculateRelationship(graph, 'HOME', 'PIL').label).toBe('father-in-law');
    expect(calculateRelationship(graph, 'HOME', 'SIL').label).toBe('sister-in-law');
    expect(calculateRelationship(graph, 'HOME', 'KIDW').label).toBe('daughter-in-law');
    expect(calculateRelationship(graph, 'HOME', 'SIBH').label).toBe('brother-in-law');
  });

  it('falls back to a possessive for a spouse\'s wider kin', () => {
    const graph = makeGraph(
      ['F: husband=WGF wife=WGM children=WMOM', 'F: wife=WMOM children=WIFE', 'F: husband=HOME wife=WIFE'],
      { WIFE: 'F', WMOM: 'F', WGM: 'F', WGF: 'M' },
    );
    expect(calculateRelationship(graph, 'HOME', 'WGF').label).toBe("your wife's grandfather");
  });
});

describe('step-family', () => {
  const BLENDED = makeGraph(
    [
      'F: husband=DAD wife=MOM children=HOME',
      'F: husband=DAD wife=STEPMOM',
      'F: husband=SMH wife=STEPMOM children=STEPBRO',
      'F: husband=SMF children=STEPMOM',
    ],
    { DAD: 'M', MOM: 'F', STEPMOM: 'F', STEPBRO: 'M', SMF: 'M' },
  );

  it("names a parent's later wife a stepmother", () => {
    expect(calculateRelationship(BLENDED, 'HOME', 'STEPMOM').label).toBe('stepmother');
  });

  it("names the stepmother's own son a stepbrother", () => {
    const rel = calculateRelationship(BLENDED, 'HOME', 'STEPBRO');
    expect(rel.label).toBe('stepbrother');
    expect(rel.tier).toBe('distant');
  });

  it("reaches the stepmother's father by possessive", () => {
    expect(calculateRelationship(BLENDED, 'HOME', 'SMF').label).toBe("your stepmother's father");
  });

  it('stops at two marriage edges', () => {
    const graph = makeGraph(
      [
        'F: husband=DAD children=HOME,SIB',
        'F: husband=SIB wife=SIBW',
        'F: husband=SIBWF children=SIBW',
      ],
      { SIB: 'M', SIBW: 'F', SIBWF: 'M' },
    );
    expect(calculateRelationship(graph, 'HOME', 'SIBW').label).toBe('sister-in-law');
    expect(calculateRelationship(graph, 'HOME', 'SIBWF').tier).toBe('none');
  });
});

describe('blood beats marriage', () => {
  it('keeps the cousin when you married her', () => {
    const graph = makeGraph(
      [
        'F: husband=GF wife=GM children=DAD,U',
        'F: husband=DAD wife=MOM children=HOME',
        'F: husband=U wife=UW children=COUSIN',
        'F: husband=HOME wife=COUSIN',
      ],
      { COUSIN: 'F', DAD: 'M', U: 'M', HOME: 'M' },
    );
    const rel = calculateRelationship(graph, 'HOME', 'COUSIN');
    expect(rel.label).toBe('1st cousin — also your wife');
    expect(rel.tier).toBe('blood');
    expect(rel.isCollateral).toBe(true);
  });
});

describe('adoption, fostering, and step links', () => {
  it('keeps an adopted child on the line and says so', () => {
    const graph = makeGraph(['F: husband=DAD wife=MOM children=HOME adopted=HOME'], {
      DAD: 'M',
      MOM: 'F',
    });
    const up = calculateRelationship(graph, 'HOME', 'DAD');
    expect(up.label).toBe('adoptive father');
    expect(up.tier).toBe('direct');
    expect(up.qualifier).toBe('adoptive');
    const down = calculateRelationship(graph, 'DAD', 'HOME');
    expect(down.label).toBe('adopted child');
    expect(down.tier).toBe('direct');
  });

  it('carries the qualifier up past the typed link', () => {
    const graph = makeGraph(
      ['F: husband=GF children=DAD', 'F: husband=DAD children=HOME adopted=HOME'],
      { GF: 'M', DAD: 'M' },
    );
    expect(calculateRelationship(graph, 'HOME', 'GF').label).toBe('adoptive grandfather');
  });

  it('distinguishes a birth parent from an adoptive one', () => {
    const graph = makeGraph(
      ['F: husband=BIRTHDAD children=HOME', 'F: husband=ADOPTDAD children=HOME adopted=HOME'],
      { BIRTHDAD: 'M', ADOPTDAD: 'M' },
    );
    expect(calculateRelationship(graph, 'HOME', 'BIRTHDAD').label).toBe('birth father');
    expect(calculateRelationship(graph, 'HOME', 'ADOPTDAD').label).toBe('adoptive father');
  });

  it('never lets a step link claim a parent slot', () => {
    const graph = makeGraph(
      ['F: husband=STEPDAD children=HOME step=HOME', 'F: husband=DAD children=HOME'],
      { STEPDAD: 'M', DAD: 'M' },
    );
    expect(calculateRelationship(graph, 'HOME', 'DAD').label).toBe('father');
    expect(calculateRelationship(graph, 'HOME', 'STEPDAD').tier).not.toBe('direct');
  });

  it('keeps a fostered child on the line with a foster label', () => {
    const graph = makeGraph(['F: wife=FMOM children=HOME foster=HOME'], { FMOM: 'F' });
    expect(calculateRelationship(graph, 'HOME', 'FMOM').label).toBe('foster mother');
  });
});
