import { describe, expect, it } from 'vitest';
import {
  ancestorGenerations,
  averageAgeAtFirstMarriageByCentury,
  averageAgeAtFirstMarriageBySex,
  averageChildrenPerFamilyByCentury,
  averageLifespanByCentury,
  averageLifespanBySurname,
  diedInInfancy,
  diedYoungest,
  familiesBySurvivingChildren,
  firstMarriageAges,
  lateParenthood,
  lifespanOf,
  longestLived,
  longestMarriages,
  marriageAgeExtremes,
  marriedMoreThanOnce,
  mortalityByDecade,
  mostChildren,
  neverMarried,
  oldestVerifiedAncestor,
  reachedAge,
  surnameLineDepths,
  treeGenerationSpan,
  widowedAndRemarried,
  widowedMultipleTimes,
} from '../milestones.js';
import { buildIndex } from './buildIndex.js';

describe('lifespans', () => {
  const index = buildIndex([
    { id: 'ancient', birth: 1700, death: 1795 }, // 95
    { id: 'steady', birth: 1700, death: 1760 }, // 60
    { id: 'young', birth: 1700, death: 1712 }, // 12
    { id: 'infant', birth: 1700, death: 1702 }, // 2
    { id: 'anomaly', birth: 1700, death: 1830 }, // 130 — conflated record
    { id: 'undated', birth: null, death: 1750 },
  ]);

  it('guards implausible lifespans', () => {
    expect(lifespanOf({ ...index.individuals.get('anomaly')! })).toBeNull();
    expect(lifespanOf({ ...index.individuals.get('undated')! })).toBeNull();
  });

  it('ranks the longest lived, excluding anomalies', () => {
    const top = longestLived(index);
    expect(top[0]!.individual.id).toBe('ancient');
    expect(top[0]!.lifespan).toBe(95);
    expect(top.map((e) => e.individual.id)).not.toContain('anomaly');
  });

  it('finds the youngest deaths above the infant-mortality floor', () => {
    const top = diedYoungest(index);
    expect(top[0]!.individual.id).toBe('young');
    expect(top.map((e) => e.individual.id)).not.toContain('infant');
  });

  it('lists infant deaths separately', () => {
    expect(diedInInfancy(index).map((e) => e.individual.id)).toEqual(['infant']);
  });

  it('filters by age reached', () => {
    expect(reachedAge(index, 90).map((e) => e.individual.id)).toEqual(['ancient']);
    expect(reachedAge(index, 60).map((e) => e.individual.id)).toEqual(['ancient', 'steady']);
  });
});

describe('cohort lifespans', () => {
  const index = buildIndex([
    { id: 'a', birth: 1650, death: 1690 }, // 40
    { id: 'b', birth: 1660, death: 1720 }, // 60
    { id: 'c', birth: 1750, death: 1820 }, // 70
    { id: 'd', name: 'Ann Field', birth: 1755, death: 1845 }, // 90
    { id: 'e', name: 'Ben Field', birth: 1760, death: 1830 }, // 70
    { id: 'f', name: 'Cal Field', birth: 1765, death: 1845 }, // 80
  ]);

  it('averages by birth century in ascending order', () => {
    expect(averageLifespanByCentury(index)).toEqual([
      { century: 1600, count: 2, averageLifespan: 50 },
      { century: 1700, count: 4, averageLifespan: 77.5 },
    ]);
  });

  it('averages by surname line above the minimum count', () => {
    const lines = averageLifespanBySurname(index, 3);
    expect(lines).toEqual([{ surname: 'Field', count: 3, averageLifespan: 80 }]);
  });

  it('counts mortality by decade, busiest first', () => {
    const decades = mortalityByDecade(index);
    expect(decades[0]).toEqual({ decade: 1840, count: 2 });
  });
});

describe('marriage milestones', () => {
  //  greatheart marries twice (1720 young widow case), late marries at 61.
  const index = buildIndex(
    [
      { id: 'greatheart', sex: 'F', birth: 1700, death: 1780 },
      { id: 'first-husband', sex: 'M', birth: 1695, death: 1725 },
      { id: 'second-husband', sex: 'M', birth: 1690, death: 1770 },
      { id: 'late', sex: 'M', birth: 1700, death: 1790 },
      { id: 'late-wife', sex: 'F', birth: 1720, death: 1795 },
      { id: 'bachelor', birth: 1700, death: 1770 },
      { id: 'child-death', birth: 1700, death: 1710 },
      { id: 'alive-now', birth: 1990, living: true },
    ],
    [
      { id: 'm1', husband: 'first-husband', wife: 'greatheart', married: 1720 },
      { id: 'm2', husband: 'second-husband', wife: 'greatheart', married: 1730 },
      { id: 'm3', husband: 'late', wife: 'late-wife', married: 1761 },
    ],
  );

  it('uses the earliest marriage for age at first marriage', () => {
    const ages = firstMarriageAges(index);
    const greatheart = ages.find((a) => a.individual.id === 'greatheart');
    expect(greatheart?.ageAtMarriage).toBe(20);
    expect(greatheart?.marriageYear).toBe(1720);
  });

  it('averages first-marriage age by century and by sex', () => {
    const byCentury = averageAgeAtFirstMarriageByCentury(index);
    expect(byCentury).toHaveLength(1);
    expect(byCentury[0]!.century).toBe(1700);
    const bySex = averageAgeAtFirstMarriageBySex(index);
    const women = bySex.find((s) => s.sex === 'F')!;
    expect(women.count).toBe(2); // greatheart at 20, late-wife at 41
    expect(women.averageAge).toBe(30.5);
  });

  it('finds the youngest and oldest first marriages', () => {
    const { youngest, oldest } = marriageAgeExtremes(index);
    expect(youngest[0]!.individual.id).toBe('greatheart');
    expect(oldest[0]!.individual.id).toBe('late');
    expect(oldest[0]!.ageAtMarriage).toBe(61);
  });

  it('finds people married more than once', () => {
    const remarried = marriedMoreThanOnce(index);
    expect(remarried).toHaveLength(1);
    expect(remarried[0]).toMatchObject({ marriages: 2 });
    expect(remarried[0]!.individual.id).toBe('greatheart');
  });

  it('finds who never married — adults with no spouse family', () => {
    const ids = neverMarried(index).map((p) => p.id);
    expect(ids).toContain('bachelor');
    expect(ids).not.toContain('greatheart');
    expect(ids).not.toContain('child-death'); // died at 10
    expect(ids).not.toContain('alive-now'); // living
  });

  it('approximates the longest marriage by the earlier death', () => {
    const marriages = longestMarriages(index);
    // m2: 1730 → greatheart dies 1780, husband 1770 → 40 years.
    // m3: 1761 → late dies 1790, wife 1795 → 29 years.
    expect(marriages[0]).toMatchObject({ marriageYear: 1730, years: 40 });
    expect(marriages[1]).toMatchObject({ marriageYear: 1761, years: 29 });
  });

  it('detects widowed-and-remarried and counts widowings', () => {
    const remarried = widowedAndRemarried(index);
    expect(remarried).toHaveLength(1);
    expect(remarried[0]!.individual.id).toBe('greatheart');
    // Both husbands died before her: widowed twice.
    expect(widowedMultipleTimes(index).map((w) => w.individual.id)).toEqual(['greatheart']);
  });
});

describe('children milestones', () => {
  const index = buildIndex(
    [
      { id: 'patriarch', sex: 'M', birth: 1700, death: 1790 },
      { id: 'wife1', sex: 'F', birth: 1705, death: 1740 },
      { id: 'wife2', sex: 'F', birth: 1720, death: 1800 },
      { id: 'c1', birth: 1730, death: 1732 },
      { id: 'c2', birth: 1732, death: 1800 },
      { id: 'c3', birth: 1748, death: 1810 },
      { id: 'c4', birth: 1752, death: null },
    ],
    [
      { id: 'fam1', husband: 'patriarch', wife: 'wife1', married: 1728, children: ['c1', 'c2'] },
      { id: 'fam2', husband: 'patriarch', wife: 'wife2', married: 1746, children: ['c3', 'c4'] },
    ],
  );

  it('counts children across all of a parent’s families', () => {
    const top = mostChildren(index);
    expect(top[0]!.individual.id).toBe('patriarch');
    expect(top[0]!.children).toBe(4);
  });

  it('averages children per family by marriage century', () => {
    expect(averageChildrenPerFamilyByCentury(index)).toEqual([
      { century: 1700, familyCount: 2, averageChildren: 2 },
    ]);
  });

  it('ranks families by children surviving to adulthood', () => {
    const families = familiesBySurvivingChildren(index);
    // fam2: both children reach adulthood (one has no death). fam1: c1 died at 2.
    expect(families[0]!.familyId).toBe('fam2');
    expect(families[0]!.survivedToAdulthood).toBe(2);
    expect(families[1]!.survivedToAdulthood).toBe(1);
  });

  it('finds late-in-life parenthood', () => {
    const late = lateParenthood(index, 45);
    expect(late.map((entry) => `${entry.parent.id}:${entry.child.id}`)).toEqual([
      'patriarch:c4',
      'patriarch:c3',
    ]);
    expect(late[0]!.parentAge).toBe(52);
  });
});

describe('generations', () => {
  // root ← father/mother ← paternal grandparents; mother's parents unknown.
  const index = buildIndex(
    [
      { id: 'root', birth: 1900, death: 1980 },
      { id: 'father', birth: 1870, death: 1940 }, // 70
      { id: 'mother', birth: 1875, death: 1965 }, // 90
      { id: 'grandpa', birth: 1840, death: 1880 }, // 40
      { id: 'grandma', birth: 1845, death: 1895 }, // 50
    ],
    [
      { husband: 'father', wife: 'mother', children: ['root'] },
      { husband: 'grandpa', wife: 'grandma', children: ['father'] },
    ],
    [
      { person: 'grandpa', type: 'birth', year: 1840, confidence: 'exact' },
      { person: 'root', type: 'birth', year: 1900, confidence: 'exact' },
      { person: 'grandma', type: 'birth', year: 1845, confidence: 'approximate' },
    ],
  );

  it('measures the tree’s generation span', () => {
    expect(treeGenerationSpan(index)).toBe(3);
  });

  it('groups direct ancestors by generation with average lifespans', () => {
    expect(ancestorGenerations(index, 'root')).toEqual([
      { generation: 0, count: 1, averageLifespan: 80 },
      { generation: 1, count: 2, averageLifespan: 80 },
      { generation: 2, count: 2, averageLifespan: 45 },
    ]);
  });

  it('reports surname line depth and where lines go cold', () => {
    const lines = surnameLineDepths(index, 1);
    const rootLine = lines.find((l) => l.surname === 'grandpa');
    expect(rootLine?.earliestBirthYear).toBe(1840);
    // grandpa has no documented parents: his line goes cold at his birth.
    expect(rootLine?.lineColdAt).toBe(1840);
  });

  it('finds the oldest ancestor with an exact birth record', () => {
    expect(oldestVerifiedAncestor(index)?.id).toBe('grandpa');
  });
});
