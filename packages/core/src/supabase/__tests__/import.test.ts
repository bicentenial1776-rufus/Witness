import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../../gedcom/index.js';
import type { WitnessSupabaseClient } from '../client.js';
import { GedcomImportError, importParsedGedcom } from '../import.js';
import { buildImportPayload } from '../transform.js';

const fixturePath = new URL('../../../fixtures/sample.ged', import.meta.url);
const parsed = parseGedcom(readFileSync(fixturePath, 'utf-8'), 'sample.ged');
const USER_ID = '00000000-0000-0000-0000-000000000001';

type Reply = { error: { message: string; code?: string } | null; status: number };
type Sent = { table: string; rows: Record<string, unknown>[] };

const OK: Reply = { error: null, status: 201 };
const NETWORK_LOST: Reply = {
  error: { message: 'TypeError: fetch failed: The network connection was lost.', code: '' },
  status: 0,
};
const STATEMENT_TIMEOUT: Reply = {
  error: { message: 'canceling statement due to statement timeout', code: '57014' },
  status: 500,
};
const FOREIGN_KEY: Reply = {
  error: { message: 'insert or update on table "families" violates foreign key constraint', code: '23503' },
  status: 409,
};

/**
 * Records every batch and answers from a script: a table's scripted replies
 * are consumed in order by its requests, and anything unscripted succeeds.
 */
function fakeClient(script: Record<string, Reply[]> = {}) {
  const sent: Sent[] = [];
  const reply = (key: string): Reply => script[key]?.shift() ?? OK;
  const client = {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        sent.push({ table, rows: [row] });
        return Promise.resolve(reply(table));
      },
      upsert: (rows: Record<string, unknown>[]) => {
        sent.push({ table, rows });
        return Promise.resolve(reply(table));
      },
      update: (row: Record<string, unknown>) => ({
        eq: () => {
          sent.push({ table: `${table}:update`, rows: [row] });
          return Promise.resolve(reply(`${table}:update`));
        },
      }),
    }),
    rpc: () => Promise.resolve({ error: null, data: null }),
  };
  return { client: client as unknown as WitnessSupabaseClient, sent };
}

const batches = (sent: Sent[], table: string) => sent.filter((s) => s.table === table);
const options = { userId: USER_ID, batchSize: 4, retryDelayMs: 0 };

describe('importParsedGedcom', () => {
  it('stamps the tree importing on the way in and complete on the way out', async () => {
    const { client, sent } = fakeClient();
    const { treeId } = await importParsedGedcom(client, parsed, options);

    expect(sent[0]).toMatchObject({ table: 'trees', rows: [{ id: treeId, import_status: 'importing' }] });
    expect(sent.at(-1)).toMatchObject({
      table: 'trees:update',
      rows: [{ individual_count: parsed.individuals.size, import_status: 'complete' }],
    });
  });

  it('writes the file’s notes after the people they belong to', async () => {
    const noted = parseGedcom(
      readFileSync(fixturePath, 'utf-8').replace('1 BURI', '1 NOTE Kept from the file.\n1 BURI'),
      'sample.ged',
    );
    const { client, sent } = fakeClient();
    await importParsedGedcom(client, noted, options);

    const order = sent.map((s) => s.table);
    const notesAt = order.indexOf('individual_notes');
    expect(notesAt).toBeGreaterThan(order.lastIndexOf('individuals'));
    expect(notesAt).toBeLessThan(order.indexOf('families'));
    expect(batches(sent, 'individual_notes').flatMap((b) => b.rows)).toEqual([
      expect.objectContaining({ content: 'Kept from the file.', position: 0 }),
    ]);
  });

  it('resends a batch after a lost connection and still finishes', async () => {
    const { client, sent } = fakeClient({ individuals: [NETWORK_LOST] });
    await importParsedGedcom(client, parsed, options);

    const individuals = batches(sent, 'individuals');
    expect(individuals.length).toBe(Math.ceil(parsed.individuals.size / 4) + 1);
    // The same rows, ids included — an upsert that ignores duplicates makes
    // resending a batch the server may already hold a safe thing to do.
    expect(individuals[1]!.rows).toEqual(individuals[0]!.rows);
  });

  it('splits a batch the database could not finish in time rather than resending it whole', async () => {
    const { client, sent } = fakeClient({ individuals: [STATEMENT_TIMEOUT] });
    await importParsedGedcom(client, parsed, options);

    const sizes = batches(sent, 'individuals').map((b) => b.rows.length);
    expect(sizes.slice(0, 3)).toEqual([4, 2, 2]);
  });

  it('gives up on a failure that keeps happening, saying how many times it tried', async () => {
    const { client } = fakeClient({ places: [NETWORK_LOST, NETWORK_LOST, NETWORK_LOST, NETWORK_LOST, NETWORK_LOST] });
    await expect(importParsedGedcom(client, parsed, options)).rejects.toThrow(/after 5 attempts/);
  });

  it('stops at once on an error retrying cannot fix, naming where it stopped', async () => {
    const { client, sent } = fakeClient({ families: [FOREIGN_KEY] });
    const payload = buildImportPayload(parsed, { userId: USER_ID });
    const landed = payload.places.length + payload.individuals.length + payload.individualEvents.length;

    const failure = await importParsedGedcom(client, parsed, options).catch((e) => e);
    expect(failure).toBeInstanceOf(GedcomImportError);
    expect(failure).toMatchObject({ table: 'families', insertedRows: landed });
    expect(failure.treeId).toBe((sent[0]!.rows[0] as { id: string }).id);
    expect(batches(sent, 'families')).toHaveLength(1);
    expect(batches(sent, 'trees:update')).toHaveLength(0);
  });
});
