import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { makeUnitParser, type UnitTerms } from '../normalizers/unitDesignation.js';

const terms = JSON.parse(
  readFileSync(join(__dirname, '../../../../../data/registers/cw-regiments/unit-terms.json'), 'utf8'),
) as UnitTerms;
const parse = makeUnitParser(terms);

// The ≥50-string gauntlet the spec demands: Dyer-style designations,
// Ancestry-export phrasings, abbreviation salads, and strings that MUST
// NOT parse. [input, expected unitKey | null, company?, confidence?]
const CASES: Array<[string, string | null, string | null, ('high' | 'medium')?]> = [
  // Canonical and Dyer-style
  ['5th Iowa Infantry', 'US-IA-INF-5', null, 'high'],
  ['5th Regiment Iowa Volunteer Infantry', 'US-IA-INF-5', null, 'high'],
  ['Fifth Regiment Iowa Volunteer Infantry', 'US-IA-INF-5', null, 'high'],
  ['12th Regiment Iowa Infantry', 'US-IA-INF-12', null, 'high'],
  ['1st Maine Cavalry', 'US-ME-CAV-1', null, 'high'],
  ['21st Massachusetts Infantry', 'US-MA-INF-21', null, 'high'],
  ['54th Massachusetts Infantry', 'US-MA-INF-54', null, 'high'],
  ['2nd Rhode Island Infantry', 'US-RI-INF-2', null, 'high'],
  ['9th New Hampshire Infantry', 'US-NH-INF-9', null, 'high'],
  ['33rd New Jersey Infantry', 'US-NJ-INF-33', null, 'high'],
  ['148th Pennsylvania Infantry', 'US-PA-INF-148', null, 'high'],
  ['1st Vermont Heavy Artillery', 'US-VT-HA-1', null, 'high'],
  ['2nd Connecticut Light Artillery', 'US-CT-LA-ART-2', null, 'high'],
  ['1st Michigan Engineers', 'US-MI-ENG-1', null, 'high'],
  ['1st United States Colored Troops Infantry', 'US-USCT-INF-1', null, 'high'],
  ['29th Regiment USCT Infantry', 'US-USCT-INF-29', null, 'high'],
  ['13th Tennessee Cavalry', 'US-TN-CAV-13', null, 'high'],
  ['8th Wisconsin Infantry', 'US-WI-INF-8', null, 'high'],
  ['7th Minnesota Infantry', 'US-MN-INF-7', null, 'high'],
  ['4th West Virginia Cavalry', 'US-WV-CAV-4', null, 'high'],

  // Abbreviation salads
  ['5 IA INF', 'US-IA-INF-5', null, 'high'],
  ['5 IA VOL INF', 'US-IA-INF-5', null, 'high'],
  ['21 MASS INF', 'US-MA-INF-21', null, 'high'],
  ['1 ME CAV', 'US-ME-CAV-1', null, 'high'],
  ['12th Regt. Ill. Vol. Inf.', 'US-IL-INF-12', null, 'high'],
  ['3d Wis. Cav.', 'US-WI-CAV-3', null, 'high'],
  ['9th N.Y. Inf.', 'US-NY-INF-9', null, 'high'],
  ['2d Mo. Lt. Arty.', 'US-MO-LA-ART-2', null, 'high'],
  ['14th Conn Inf', 'US-CT-INF-14', null, 'high'],
  ['6th Kan. Cav.', 'US-KS-CAV-6', null, 'high'],

  // Company and rank riders
  ['Co. K, 5th Iowa Inf.', 'US-IA-INF-5', 'K', 'high'],
  ['Company B, 21st Massachusetts Infantry', 'US-MA-INF-21', 'B', 'high'],
  ['Co K 5 Iowa Infantry', 'US-IA-INF-5', 'K', 'high'],
  ['Pvt., Co. A, 148th Penna. Vols.', 'US-PA-UNK-148', 'A', 'medium'],
  ['Private, Co. G, 9th Vermont Infantry', 'US-VT-INF-9', 'G', 'high'],
  ['Sgt Co C 3rd Michigan Cavalry', 'US-MI-CAV-3', 'C', 'high'],
  ['Corporal, 24th Ohio Infantry', 'US-OH-INF-24', null, 'high'],

  // Ancestry-export phrasings
  ['5th Regiment, Iowa Infantry', 'US-IA-INF-5', null, 'high'],
  ['Iowa 5th Infantry Regiment', 'US-IA-INF-5', null, 'high'],
  ['12th Iowa Infantry Regiment, Company K', 'US-IA-INF-12', 'K', 'high'],
  ['1st Regiment, Maine Cavalry (3 years)', 'US-ME-CAV-1', null, 'high'],
  ['Massachusetts 54th Volunteer Infantry', 'US-MA-INF-54', null, 'high'],

  // Branch missing — medium, never assumed
  ['5th Iowa', 'US-IA-UNK-5', null, 'medium'],
  ['21st Massachusetts Volunteers', 'US-MA-UNK-21', null, 'medium'],
  ['9th Regiment New York', 'US-NY-UNK-9', null, 'medium'],

  // Must NOT parse
  ['5th son born in Iowa', null, null],
  ['served in the war', null, null],
  ['Iowa', null, null],
  ['Infantry', null, null],
  ['He moved to Massachusetts in 1855 with his family and never returned', null, null],
  ['5th Wisconsin Sharpshooters Reunion Association Records', null, null],
];

describe('parseUnitDesignation', () => {
  it('meets the ≥80% gate over the 50-string gauntlet', () => {
    let correct = 0;
    const failures: string[] = [];
    for (const [input, expectedKey, expectedCompany] of CASES) {
      const result = parse(input);
      const gotKey = result?.unitKey ?? null;
      const companyOk = expectedCompany === null || result?.company === expectedCompany;
      if (gotKey === expectedKey && companyOk) correct += 1;
      else failures.push(`"${input}" → ${gotKey} (co ${result?.company ?? '-'}), wanted ${expectedKey}`);
    }
    const rate = correct / CASES.length;
    if (failures.length) console.log('unit-parse misses:\n  ' + failures.join('\n  '));
    expect(CASES.length).toBeGreaterThanOrEqual(50);
    expect(rate).toBeGreaterThanOrEqual(0.8);
  });

  it('reports confidence honestly', () => {
    expect(parse('5th Iowa Infantry')?.confidence).toBe('high');
    expect(parse('5th Iowa')?.confidence).toBe('medium');
  });

  it('extracts rank when present', () => {
    expect(parse('Private, Co. G, 9th Vermont Infantry')?.rank).toBe('private');
  });
});
