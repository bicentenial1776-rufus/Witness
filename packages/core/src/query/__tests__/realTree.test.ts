import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../../gedcom/index.js';
import { rankLivedThroughEvents } from '../../history/livedThrough.js';
import { HISTORICAL_EVENTS } from '../../history/events.js';
import { LIVED_THROUGH_TAG_CAP } from '../../history/livedThrough.js';
import {
  averageAgeAtFirstMarriageByCentury,
  averageChildrenPerFamilyByCentury,
  averageLifespanByCentury,
  diedInInfancy,
  diedYoungest,
  firstMarriageAges,
  longestLived,
  longestMarriages,
  marriedMoreThanOnce,
  mostChildren,
  neverMarried,
  reachedAge,
  surnameLineDepths,
  treeGenerationSpan,
  widowedAndRemarried,
} from '../milestones.js';
import {
  duplicateCandidates,
  familiesSpanningCountries,
  mostDescendants,
  mostDistantPair,
  mostGrandchildren,
  mostSiblings,
  sameSurnameMarriages,
} from '../structure.js';
import { buildTreeIndexFromParsed, type TreeIndex } from '../treeIndex.js';

/**
 * Acceptance run of the Section II and Section X queries over the real
 * 5,495-person tree. The fixture is personal data and gitignored, so this
 * suite skips wherever it is absent (CI, fresh clones) and runs on any
 * machine that has it. Assertions are invariants, not memorized values:
 * they must hold for any healthy import of this tree.
 */

const fixturePath = fileURLToPath(new URL('../../../fixtures/Howe_Field Family Tree.ged', import.meta.url));
const hasFixture = existsSync(fixturePath);

// describe.skipIf still runs the suite factory, so the 11MB parse must be
// lazy — it happens only when a test actually executes.
let cached: TreeIndex | undefined;
function loadIndex(): TreeIndex {
  return (cached ??= buildTreeIndexFromParsed(parseGedcom(readFileSync(fixturePath, 'utf-8'))));
}

describe.skipIf(!hasFixture)('Section II — life milestones (real Howe/Field GEDCOM)', () => {

  it('finds the longest-lived without anomalies leaking through', () => {
    const index = loadIndex();
    const top = longestLived(index);
    expect(top).toHaveLength(10);
    expect(top[0]!.lifespan).toBeGreaterThanOrEqual(85);
    expect(top[0]!.lifespan).toBeLessThanOrEqual(100);
    for (let i = 1; i < top.length; i++) {
      expect(top[i]!.lifespan).toBeLessThanOrEqual(top[i - 1]!.lifespan);
    }
  });

  it('separates infant deaths from the died-youngest list', () => {
    const index = loadIndex();
    expect(diedInInfancy(index).length).toBeGreaterThan(0);
    for (const entry of diedYoungest(index)) {
      expect(entry.lifespan).toBeGreaterThanOrEqual(5);
    }
  });

  it('spans centuries of lifespan data in ascending order', () => {
    const index = loadIndex();
    const cohorts = averageLifespanByCentury(index);
    expect(cohorts.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < cohorts.length; i++) {
      expect(cohorts[i]!.century).toBeGreaterThan(cohorts[i - 1]!.century);
    }
    for (const cohort of cohorts) {
      expect(cohort.averageLifespan).toBeGreaterThan(0);
      expect(cohort.averageLifespan).toBeLessThanOrEqual(100);
    }
  });

  it('finds nonagenarians but no impossible ages', () => {
    const index = loadIndex();
    const ninety = reachedAge(index, 90);
    expect(ninety.length).toBeGreaterThan(0);
    expect(ninety[0]!.lifespan).toBeLessThanOrEqual(100);
  });

  it('computes plausible first-marriage ages', () => {
    const index = loadIndex();
    const ages = firstMarriageAges(index);
    expect(ages.length).toBeGreaterThan(100);
    for (const record of ages.slice(0, 500)) {
      expect(record.ageAtMarriage).toBeGreaterThanOrEqual(10);
      expect(record.ageAtMarriage).toBeLessThanOrEqual(90);
    }
    expect(averageAgeAtFirstMarriageByCentury(index).length).toBeGreaterThanOrEqual(2);
  });

  it('finds remarriages, widowings, and the never-married', () => {
    const index = loadIndex();
    const remarried = marriedMoreThanOnce(index);
    expect(remarried.length).toBeGreaterThan(0);
    for (const entry of remarried) expect(entry.marriages).toBeGreaterThanOrEqual(2);

    expect(widowedAndRemarried(index).length).toBeGreaterThan(0);

    const single = new Set(neverMarried(index).map((p) => p.id));
    for (const entry of remarried) expect(single.has(entry.individual.id)).toBe(false);
  });

  it('ranks family sizes and marriage durations plausibly', () => {
    const index = loadIndex();
    const top = mostChildren(index);
    expect(top[0]!.children).toBeGreaterThanOrEqual(8);
    expect(averageChildrenPerFamilyByCentury(index).length).toBeGreaterThanOrEqual(2);
    const marriages = longestMarriages(index);
    expect(marriages[0]!.years).toBeGreaterThanOrEqual(40);
    expect(marriages[0]!.years).toBeLessThanOrEqual(100);
  });

  it('measures generational depth of the whole tree', () => {
    const index = loadIndex();
    const span = treeGenerationSpan(index);
    expect(span).toBeGreaterThanOrEqual(8);
    expect(span).toBeLessThanOrEqual(30);
  });

  it('traces surname lines back and forward', () => {
    const index = loadIndex();
    const lines = surnameLineDepths(index);
    const howe = lines.find((line) => line.surname === 'Howe');
    expect(howe).toBeDefined();
    expect(howe!.earliestBirthYear).toBeLessThan(1800);
  });
});

describe.skipIf(!hasFixture)('Section X — family structure (real Howe/Field GEDCOM)', () => {

  it('counts descendants, grandchildren, and siblings coherently', () => {
    const index = loadIndex();
    const descendants = mostDescendants(index);
    const grandchildren = mostGrandchildren(index);
    const siblings = mostSiblings(index);
    expect(descendants[0]!.descendants).toBeGreaterThanOrEqual(grandchildren[0]!.grandchildren);
    expect(siblings[0]!.siblings).toBeGreaterThanOrEqual(5);
    // A person's descendants include at least their grandchildren.
    const topGrandparent = grandchildren[0]!;
    const sameInDescendants = mostDescendants(index, 5000).find(
      (d) => d.individual.id === topGrandparent.individual.id,
    );
    expect(sameInDescendants!.descendants).toBeGreaterThanOrEqual(topGrandparent.grandchildren);
  });

  it('keeps duplicate candidates within tolerance', () => {
    const index = loadIndex();
    for (const pair of duplicateCandidates(index)) {
      expect(pair.birthYearGap).toBeLessThanOrEqual(2);
      expect(pair.a.id).not.toBe(pair.b.id);
    }
  });

  it('keeps same-surname marriages honest', () => {
    const index = loadIndex();
    for (const match of sameSurnameMarriages(index)) {
      expect(match.husband.surname!.toLowerCase()).toBe(match.wife.surname!.toLowerCase());
    }
  });

  it('finds families straddling countries in a single year', () => {
    const index = loadIndex();
    for (const span of familiesSpanningCountries(index)) {
      expect(span.countries.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('finds a distant pair far apart in a 5,495-person tree', () => {
    const index = loadIndex();
    const pair = mostDistantPair(index);
    expect(pair).not.toBeNull();
    expect(pair!.steps).toBeGreaterThanOrEqual(10);
  });
});

describe.skipIf(!hasFixture)('Lived Through tags (real Howe/Field GEDCOM)', () => {
  it('caps every ancestor at 5 tags and tags colonial lives correctly', () => {
    const index = loadIndex();
    let tagged = 0;
    for (const person of index.individuals.values()) {
      const tags = rankLivedThroughEvents(person, HISTORICAL_EVENTS, new Set(['Massachusetts']));
      expect(tags.length).toBeLessThanOrEqual(LIVED_THROUGH_TAG_CAP);
      if (tags.length) tagged++;
    }
    expect(tagged).toBeGreaterThan(1000);
  });
});
