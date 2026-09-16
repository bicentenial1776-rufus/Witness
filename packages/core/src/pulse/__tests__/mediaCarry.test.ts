import { describe, expect, it } from 'vitest';

import type { IdRemap } from '../carryForward.js';
import {
  carriedStoragePath,
  photosNote,
  planMediaCarry,
  type NewMediaRow,
  type OldMediaLink,
  type OldMediaRow,
} from '../mediaCarry.js';

function oldRow(
  id: string,
  gedcom_xref: string,
  file_path: string | null,
  extra: Partial<OldMediaRow> = {},
): OldMediaRow {
  return {
    id,
    gedcom_xref,
    file_path,
    title: null,
    format: 'jpg',
    storage_path: `owner/old-tree/${id}.jpg`,
    byte_size: 1234,
    content_hash: `hash-${id}`,
    upload_status: 'complete',
    ...extra,
  };
}

function newRow(
  id: string,
  gedcom_xref: string,
  file_path: string | null,
  upload_status = 'pending',
): NewMediaRow {
  return { id, gedcom_xref, file_path, upload_status };
}

function remapOf(pairs: [string, string][]): IdRemap {
  return {
    map: new Map(pairs),
    orphaned: new Set(),
    tiers: { uid: 0, xref: 0, conservative: pairs.length },
  };
}

const noLinks: OldMediaLink[] = [];

describe('planMediaCarry', () => {
  it('adopts the new row with the same xref when the file names agree', () => {
    const plan = planMediaCarry(
      [oldRow('m1', '@M1@', 'Media/portrait.jpg')],
      [newRow('n1', '@M1@', 'Media/portrait.jpg')],
      noLinks,
      remapOf([]),
    );
    expect(plan.adopting).toEqual([
      { old: expect.objectContaining({ id: 'm1' }), newMediaId: 'n1', newGedcomXref: '@M1@', tier: 'xref' },
    ]);
    expect(plan.tiers).toEqual({ xref: 1, path: 0, person: 0 });
    expect(plan.stranded).toHaveLength(0);
  });

  it('ignores pointer delimiters and case on the xref', () => {
    const plan = planMediaCarry(
      [oldRow('m1', 'M1', 'a.jpg')],
      [newRow('n1', '@m1@', 'a.jpg')],
      noLinks,
      remapOf([]),
    );
    expect(plan.adopting[0]?.newMediaId).toBe('n1');
  });

  it('refuses a same-xref match whose file names disagree, and finds the file by name instead', () => {
    // A renumbered export: @M1@ now names a different file, and the old
    // file has moved to @M7@.
    const plan = planMediaCarry(
      [oldRow('m1', '@M1@', 'C:\\Media\\Grandpa.JPG')],
      [newRow('n1', '@M1@', 'Media/census-1900.jpg'), newRow('n7', '@M7@', 'Media/grandpa.jpg')],
      noLinks,
      remapOf([]),
    );
    expect(plan.adopting).toEqual([
      { old: expect.objectContaining({ id: 'm1' }), newMediaId: 'n7', newGedcomXref: '@M7@', tier: 'path' },
    ]);
    expect(plan.tiers.path).toBe(1);
  });

  it('adopts by xref when either side has no file name to compare', () => {
    const plan = planMediaCarry(
      [oldRow('m1', '@M1@', 'Media/a.jpg')],
      [newRow('n1', '@M1@', null)],
      noLinks,
      remapOf([]),
    );
    expect(plan.adopting[0]?.tier).toBe('xref');
  });

  it('never matches an ambiguous file name', () => {
    const plan = planMediaCarry(
      [oldRow('m1', '@M1@', 'Media/photo.jpg')],
      [newRow('n1', '@M9@', 'Media/A/photo.jpg'), newRow('n2', '@M8@', 'Media/B/photo.jpg')],
      noLinks,
      remapOf([]),
    );
    expect(plan.adopting).toHaveLength(0);
    expect(plan.stranded).toHaveLength(1);
  });

  it('prefers the full path over the bare name when both are unique', () => {
    const plan = planMediaCarry(
      [oldRow('m1', '@M1@', 'Media/A/photo.jpg')],
      [newRow('n1', '@M9@', 'Media/A/photo.jpg'), newRow('n2', '@M8@', 'Media/B/photo.jpg')],
      noLinks,
      remapOf([]),
    );
    expect(plan.adopting[0]?.newMediaId).toBe('n1');
  });

  it('recreates a row with no counterpart where its people landed', () => {
    const links: OldMediaLink[] = [
      { media_id: 'm1', individual_id: 'old-p1', is_primary: true },
      { media_id: 'm1', individual_id: 'old-p2', is_primary: false },
      { media_id: 'm1', individual_id: 'old-gone', is_primary: false },
      { media_id: 'm1', individual_id: null, is_primary: false },
    ];
    const plan = planMediaCarry(
      [oldRow('m1', '@M1@', null)],
      [],
      links,
      remapOf([
        ['old-p1', 'new-p1'],
        ['old-p2', 'new-p2'],
      ]),
    );
    expect(plan.recreating).toEqual([
      {
        old: expect.objectContaining({ id: 'm1' }),
        gedcomXref: '@M1@',
        links: [
          { individual_id: 'new-p1', is_primary: true },
          { individual_id: 'new-p2', is_primary: false },
        ],
      },
    ]);
    expect(plan.tiers.person).toBe(1);
  });

  it('keys a recreated row away from a different file that took its xref', () => {
    const plan = planMediaCarry(
      [oldRow('m1', '@M1@', 'Media/grandpa.jpg')],
      [newRow('n1', '@M1@', 'Media/census.jpg')],
      [{ media_id: 'm1', individual_id: 'p', is_primary: true }],
      remapOf([['p', 'np']]),
    );
    expect(plan.adopting).toHaveLength(0);
    expect(plan.recreating[0]?.gedcomXref).toBe('@M1@#carried');
  });

  it('strands a row whose every person is gone from the new file', () => {
    const plan = planMediaCarry(
      [oldRow('m1', '@M1@', 'Media/a.jpg')],
      [],
      [{ media_id: 'm1', individual_id: 'old-gone', is_primary: true }],
      remapOf([]),
    );
    expect(plan.recreating).toHaveLength(0);
    expect(plan.stranded.map((r) => r.id)).toEqual(['m1']);
  });

  it('ignores old rows that never uploaded — the new import already recreated them', () => {
    const plan = planMediaCarry(
      [
        oldRow('m1', '@M1@', 'a.jpg', { upload_status: 'pending', storage_path: null }),
        oldRow('m2', '@M2@', 'b.jpg', { upload_status: 'complete', storage_path: null }),
      ],
      [newRow('n1', '@M1@', 'a.jpg'), newRow('n2', '@M2@', 'b.jpg')],
      noLinks,
      remapOf([]),
    );
    expect(plan.adopting).toHaveLength(0);
    expect(plan.stranded).toHaveLength(0);
  });

  it('leaves a new row alone when it already holds bytes (a retried refresh)', () => {
    const plan = planMediaCarry(
      [oldRow('m1', '@M1@', 'a.jpg')],
      [newRow('n1', '@M1@', 'a.jpg', 'complete')],
      noLinks,
      remapOf([]),
    );
    expect(plan.adopting).toHaveLength(0);
    expect(plan.alreadyComplete).toBe(1);
    expect(plan.stranded).toHaveLength(0);
  });

  it('never lands two old rows on one new row', () => {
    const plan = planMediaCarry(
      [oldRow('m1', '@M1@', 'a.jpg'), oldRow('m2', '@M2@', 'Media/a.jpg')],
      [newRow('n1', '@M1@', 'a.jpg')],
      noLinks,
      remapOf([]),
    );
    expect(plan.adopting.map((a) => [a.old.id, a.newMediaId])).toEqual([['m1', 'n1']]);
    expect(plan.stranded.map((r) => r.id)).toEqual(['m2']);
  });
});

describe('carriedStoragePath', () => {
  it('keeps the extension and moves into the new tree folder under the new row id', () => {
    expect(carriedStoragePath('u', 'new-tree', 'n1', 'u/old-tree/m1.JPG')).toBe('u/new-tree/n1.jpg');
  });

  it('copes with an object that has no extension', () => {
    expect(carriedStoragePath('u', 'new-tree', 'n1', 'u/old-tree/m1')).toBe('u/new-tree/n1');
  });
});

describe('photosNote', () => {
  it('counts adopted, recreated and already-complete rows together', () => {
    const plan = planMediaCarry(
      [oldRow('m1', '@M1@', 'a.jpg'), oldRow('m2', '@M2@', 'b.jpg'), oldRow('m3', '@M3@', null)],
      [newRow('n1', '@M1@', 'a.jpg'), newRow('n2', '@M2@', 'b.jpg', 'complete')],
      [{ media_id: 'm3', individual_id: 'p', is_primary: true }],
      remapOf([['p', 'np']]),
    );
    expect(photosNote(plan)).toBe('Your 3 photos come along.');
  });

  it('is silent with nothing to carry', () => {
    expect(photosNote(planMediaCarry([], [], [], remapOf([])))).toBeNull();
  });

  it('agrees in number', () => {
    const plan = planMediaCarry(
      [oldRow('m1', '@M1@', 'a.jpg')],
      [newRow('n1', '@M1@', 'a.jpg')],
      noLinks,
      remapOf([]),
    );
    expect(photosNote(plan)).toBe('Your 1 photo comes along.');
  });
});
