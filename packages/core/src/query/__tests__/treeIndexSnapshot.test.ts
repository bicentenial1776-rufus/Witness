import { describe, expect, it } from 'vitest';

import { buildTreeIndexFromRows } from '../treeIndex.js';
import {
  downloadTreeIndexSnapshot,
  snapshotIsCurrent,
  treeIndexObjectPath,
  uploadTreeIndexSnapshot,
} from '../treeIndexSnapshot.js';

const TREE = '4c9061f9-3141-4b07-b875-ec7208041585';

function smallIndex() {
  return buildTreeIndexFromRows(
    [
      { id: 'i1', full_name: 'Ann Howe', given_name: 'Ann', surname: 'Howe', sex: 'F', birth_year: 1800, death_year: 1870, living: false },
      { id: 'i2', full_name: 'Ben Howe', given_name: 'Ben', surname: 'Howe', sex: 'M', birth_year: 1825, death_year: null, living: false },
    ],
    [{ id: 'f1', husband_id: null, wife_id: 'i1', marriage_date_year: 1820, marriage_place_id: 'p1' }],
    [{ family_id: 'f1', individual_id: 'i2', birth_order: 1 }],
    [{ individual_id: 'i2', event_type: 'birth', date_year: 1825, place_id: 'p1', date_confidence: 'exact', detail: null }],
    [{ id: 'p1', raw: 'Watertown, Middlesex, Massachusetts, USA', parts: ['Watertown', 'Middlesex', 'Massachusetts', 'USA'] }],
  );
}

/** A Supabase client stand-in: an in-memory bucket and a trees row. */
function fakeClient() {
  const objects = new Map<string, string>();
  const tree: { index_snapshot_at: string | null } = { index_snapshot_at: null };
  const removed: string[][] = [];
  const client = {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: string) => {
          expect(bucket).toBe('tree-index');
          objects.set(path, body);
          return { error: null };
        },
        list: async (folder: string) => ({
          data: [...objects.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => ({ name: k.slice(folder.length + 1) })),
          error: null,
        }),
        remove: async (paths: string[]) => {
          removed.push(paths);
          for (const p of paths) objects.delete(p);
          return { error: null };
        },
        createSignedUrl: async (path: string) =>
          objects.has(path) ? { data: { signedUrl: `signed:${path}` }, error: null } : { data: null, error: { message: 'Object not found' } },
      }),
    },
    from: (table: string) => ({
      update: (patch: { index_snapshot_at: string }) => ({
        eq: async () => {
          expect(table).toBe('trees');
          tree.index_snapshot_at = patch.index_snapshot_at;
          return { error: null };
        },
      }),
    }),
  };
  const fetchImpl = (async (url: string) => {
    const body = objects.get(url.replace('signed:', ''));
    return body === undefined
      ? { ok: false, status: 404, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => JSON.parse(body) };
  }) as unknown as typeof fetch;
  return { client: client as never, objects, tree, removed, fetchImpl };
}

describe('tree index snapshots', () => {
  it('names the object after the tree and the stamp', () => {
    expect(treeIndexObjectPath(TREE, '2026-09-19T19:30:00.000Z')).toBe(`${TREE}/1789846200000.json`);
  });

  it('trusts a snapshot only when it is at or after the import', () => {
    expect(snapshotIsCurrent({ imported_at: '2026-09-17T10:00:00Z', index_snapshot_at: '2026-09-19T10:00:00Z' })).toBe(true);
    expect(snapshotIsCurrent({ imported_at: '2026-09-19T10:00:00Z', index_snapshot_at: '2026-09-19T10:00:00Z' })).toBe(true);
    expect(snapshotIsCurrent({ imported_at: '2026-09-19T10:00:00Z', index_snapshot_at: '2026-09-18T10:00:00Z' })).toBe(false);
    expect(snapshotIsCurrent({ imported_at: '2026-09-19T10:00:00Z', index_snapshot_at: null })).toBe(false);
    expect(snapshotIsCurrent({ imported_at: null, index_snapshot_at: '2026-09-19T10:00:00Z' })).toBe(false);
  });

  it('round-trips the index through the bucket, stamps the tree, and prunes older objects', async () => {
    const { client, objects, tree, removed, fetchImpl } = fakeClient();
    objects.set(`${TREE}/1.json`, '{"v":1}'); // an older snapshot
    const index = smallIndex();

    const uploaded = await uploadTreeIndexSnapshot(client, TREE, index);
    expect(uploaded.path).toBe(treeIndexObjectPath(TREE, uploaded.snapshotAt));
    expect(tree.index_snapshot_at).toBe(uploaded.snapshotAt);
    expect(removed).toEqual([[`${TREE}/1.json`]]);
    expect([...objects.keys()]).toEqual([uploaded.path]);

    const back = await downloadTreeIndexSnapshot(client, TREE, uploaded.snapshotAt, fetchImpl);
    expect([...back.individuals.keys()]).toEqual(['i1', 'i2']);
    expect(back.families[0]!.children).toEqual(['i2']);
    expect(back.events).toEqual(index.events);
    expect(back.places.get('p1')?.country).toBe(index.places.get('p1')?.country);
  });

  it('throws on a missing object so the caller can page the tree instead', async () => {
    const { client, fetchImpl } = fakeClient();
    await expect(downloadTreeIndexSnapshot(client, TREE, '2026-09-19T10:00:00Z', fetchImpl)).rejects.toThrow(/Signing/);
  });

  it('rejects an object that belongs to another tree', async () => {
    const { client, objects, fetchImpl } = fakeClient();
    const at = '2026-09-19T10:00:00.000Z';
    objects.set(treeIndexObjectPath(TREE, at), JSON.stringify({ v: 1, treeId: 'other', individuals: [], families: [], events: [], places: [] }));
    await expect(downloadTreeIndexSnapshot(client, TREE, at, fetchImpl)).rejects.toThrow(/not this tree/);
  });
});
