import { describe, expect, it } from 'vitest';
import {
  fromHealthFinding,
  fromMigrationPath,
  fromOceanCrossing,
  isoWeekStart,
  issueOf,
  pickWeekly,
} from '../index.js';

describe('issueOf', () => {
  it('numbers an ordinary midsummer week', () => {
    // Monday 2026-08-03 … Sunday 2026-08-09 is ISO week 32 of 2026.
    const issue = issueOf(new Date(2026, 7, 7));
    expect(issue.number).toBe(32);
    expect(issue.volume).toBe(2026);
    expect(issue.weekOfLabel).toBe('the week of August 3');
    expect(issue.key).toBe('2026-W32');
  });

  it('is the same edition all week, on every day of it', () => {
    const monday = issueOf(new Date(2026, 7, 3));
    const sunday = issueOf(new Date(2026, 7, 9));
    expect(monday.key).toBe(sunday.key);
    const nextMonday = issueOf(new Date(2026, 7, 10));
    expect(nextMonday.key).not.toBe(monday.key);
  });

  it('files an early January day under the old volume when ISO says so', () => {
    // 2027-01-01 is a Friday; its ISO week's Thursday is 2026-12-31.
    const issue = issueOf(new Date(2027, 0, 1));
    expect(issue.volume).toBe(2026);
    expect(issue.number).toBe(53);
  });

  it('starts the week on Monday even from a Sunday', () => {
    expect(isoWeekStart(new Date(2026, 7, 9)).getDate()).toBe(3);
  });
});

describe('pickWeekly', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];

  it('is deterministic for a given seed', () => {
    expect(pickWeekly(items, '2026-W32')).toBe(pickWeekly(items, '2026-W32'));
  });

  it('varies across editions', () => {
    const picks = new Set(
      Array.from({ length: 20 }, (_, week) => pickWeekly(items, `2026-W${week + 1}`)),
    );
    // Twenty weeks over five items must revisit, but not stick to one.
    expect(picks.size).toBeGreaterThan(1);
  });

  it('returns null for an empty desk — a thin week is not an error', () => {
    expect(pickWeekly([], 'any')).toBeNull();
  });
});

describe('mappers', () => {
  it('keeps the health finding sentence and all its subjects', () => {
    const finding = fromHealthFinding({
      check: 'birth_after_death' as never,
      severity: 'fail' as never,
      individualIds: ['a', 'b'],
      detail: 'Josiah Haskell was born after his own death.',
    });
    expect(finding.source).toBe('tree-health');
    expect(finding.subjectIds).toEqual(['a', 'b']);
    expect(finding.sentence).toBe('Josiah Haskell was born after his own death.');
  });

  it('writes a crossing as a voyage', () => {
    const finding = fromOceanCrossing({
      individual: {
        id: 'x',
        full_name: 'Michael Howe',
        surname: 'Howe',
        birth_year: 1820,
        death_year: 1890,
        living: false,
      },
      direction: 'toAmericas',
      from: { country: 'Ireland', placeRaw: 'Cork, Ireland', year: 1845 },
      to: { country: 'United States', placeRaw: 'Boston, Massachusetts', year: 1848 },
    });
    expect(finding.sentence).toBe(
      'Michael Howe crossed the ocean — Ireland to United States, by 1848.',
    );
  });

  it('counts a migration and keeps every mover a subject', () => {
    const finding = fromMigrationPath({
      from: 'Massachusetts',
      to: 'Nova Scotia',
      count: 2,
      medianYear: 1760,
      movers: [
        { individualId: 'a', name: 'A', fromYear: 1758, toYear: 1760 },
        { individualId: 'b', name: 'B', fromYear: 1760, toYear: 1762 },
      ],
    });
    expect(finding.sentence).toBe(
      '2 of your people moved from Massachusetts to Nova Scotia, around 1760.',
    );
    expect(finding.subjectIds).toEqual(['a', 'b']);
  });
});
