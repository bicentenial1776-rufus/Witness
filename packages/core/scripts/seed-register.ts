// Seed one historical-record register from its data directory
// (docs/witness-historical-record-registers-package.md). Idempotent and
// re-runnable: the catalog row upserts, records upsert by their stable
// slug ids, and rows a narrower re-seed no longer carries are deleted —
// their person_register_links keep their snapshot fields and drop only
// the reference pointer (on delete set null), so nothing a researcher
// confirmed ever loses its card.
//
//   npx tsx scripts/seed-register.ts ../../data/registers/<key>
//
// The directory holds:
//   register.json  — the catalog row (register_key, display_name, variant,
//                    provenance_label, coverage_caveat?, status?, config?)
//   records.csv    — Variant A/B rows. Recognized columns: id?, name |
//                    given+surname, entity_key?, birth_year?, death_year?,
//                    event_year?, source?, finding_aid_url?,
//                    transcription_confidence?; every other column lands
//                    in attributes verbatim.
//   events.csv     — optional dated/placed record events: record_id,
//                    event_type, event_year?, event_end_year?, place_text?,
//                    latitude?, longitude?, linked_event_ref?, source?
//
// Writes need the service role (reference tables have no client write
// policies): SUPABASE_SERVICE_ROLE_KEY from packages/core/.env.

import { readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { WebSocket as NodeWebSocket } from 'ws';

import { parseCsv, parseYear } from '../src/history/passengerImport.js';
import { loadEnv, requireEnv } from './env.js';

const KNOWN = new Set([
  'id', 'name', 'full_name', 'given', 'surname', 'entity_key', 'record_kind',
  'birth_year', 'death_year', 'event_year', 'source', 'finding_aid_url',
  'transcription_confidence',
]);

/** parseCsv returns raw rows (header included); key them by header. */
function csvRows(text: string): Record<string, string>[] {
  const raw = parseCsv(text);
  const header = (raw[0] ?? []).map((h) => h.trim().toLowerCase());
  return raw
    .slice(1)
    .filter((r) => r.some((f) => f.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: seed-register.ts <data/registers/<key> directory>');
    process.exit(1);
  }
  loadEnv();
  const client = createClient(
    requireEnv('EXPO_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false }, realtime: { transport: NodeWebSocket as never } },
  );

  const def = JSON.parse(readFileSync(join(dir, 'register.json'), 'utf8')) as Record<string, unknown>;
  const key = String(def['register_key'] ?? basename(dir));
  const { error: regError } = await client.from('registers').upsert(
    {
      register_key: key,
      display_name: String(def['display_name']),
      variant: String(def['variant']),
      provenance_label: String(def['provenance_label']),
      coverage_caveat: (def['coverage_caveat'] as string | undefined) ?? null,
      status: (def['status'] as string | undefined) ?? 'active',
      config: {
        ...((def['config'] as Record<string, unknown> | undefined) ?? {}),
        // Variant B ships its unit vocabulary in the catalog row so the app
        // can read a regiment out of the family's own papers (unitHints).
        ...(existsSync(join(dir, 'unit-terms.json'))
          ? { unitTerms: JSON.parse(readFileSync(join(dir, 'unit-terms.json'), 'utf8')) as unknown }
          : {}),
      } as never,
    },
    { onConflict: 'register_key' },
  );
  if (regError) {
    console.error('Register row failed:', regError.message);
    process.exit(1);
  }

  const recordsPath = join(dir, 'records.csv');
  let seeded = 0;
  const keptIds = new Set<string>();
  if (existsSync(recordsPath)) {
    const rows = csvRows(readFileSync(recordsPath, 'utf8'));
    const payload = rows.map((row) => {
      const given = row['given']?.trim() ?? '';
      const surname = row['surname']?.trim() ?? '';
      const name = row['name']?.trim() || row['full_name']?.trim() || `${given} ${surname}`.trim();
      const id = row['id']?.trim() || `${key}:${slug(`${surname || name}-${given}`)}`;
      const attributes: Record<string, unknown> = {};
      for (const [column, value] of Object.entries(row)) {
        if (!KNOWN.has(column) && value?.trim()) attributes[column] = value.trim();
      }
      for (const yearColumn of ['birth_year', 'death_year', 'event_year'] as const) {
        const year = parseYear(row[yearColumn]);
        if (year !== null) attributes[yearColumn] = year;
      }
      keptIds.add(id);
      return {
        id,
        register_key: key,
        record_kind: row['record_kind']?.trim() || (row['entity_key']?.trim() ? 'entity' : 'person'),
        name_as_recorded: name,
        surname_normalized: surname || null,
        given_normalized: given || null,
        entity_key: row['entity_key']?.trim() || null,
        attributes: attributes as never,
        source_citation: row['source']?.trim() || String(def['provenance_label']),
        finding_aid_url: row['finding_aid_url']?.trim() || null,
        transcription_confidence: row['transcription_confidence']?.trim() || null,
      };
    });
    // Duplicate slugs within one seed get a numeric suffix, the importer rule.
    const seen = new Map<string, number>();
    for (const record of payload) {
      const count = seen.get(record.id) ?? 0;
      seen.set(record.id, count + 1);
      if (count > 0) {
        record.id = `${record.id}-${count + 1}`;
        keptIds.add(record.id);
      }
    }
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await client
        .from('register_records')
        .upsert(payload.slice(i, i + 500), { onConflict: 'id' });
      if (error) {
        console.error('Record upsert failed:', error.message);
        process.exit(1);
      }
    }
    seeded = payload.length;

    // Retire rows the re-seed no longer carries.
    const { data: existing } = await client
      .from('register_records')
      .select('id')
      .eq('register_key', key);
    const stale = (existing ?? []).map((r) => r.id).filter((id) => !keptIds.has(id));
    if (stale.length > 0) {
      const { error } = await client.from('register_records').delete().in('id', stale);
      if (error) {
        console.error('Stale-record delete failed:', error.message);
        process.exit(1);
      }
    }
    console.log(`${key}: ${seeded} records seeded, ${stale.length} retired.`);
  } else {
    console.log(`${key}: catalog row seeded (no records.csv — Variant C).`);
  }

  const eventsPath = join(dir, 'events.csv');
  if (existsSync(eventsPath)) {
    const rows = csvRows(readFileSync(eventsPath, 'utf8'));
    // Events replace wholesale per register: they carry no verdicts.
    const { data: recordIds } = await client
      .from('register_records')
      .select('id')
      .eq('register_key', key);
    const ids = (recordIds ?? []).map((r) => r.id);
    if (ids.length > 0) {
      await client.from('register_record_events').delete().in('record_id', ids);
    }
    const payload = rows
      .filter((row) => row['record_id']?.trim())
      .map((row) => ({
        record_id: row['record_id']!.trim(),
        event_type: row['event_type']?.trim() || 'event',
        event_year: parseYear(row['event_year']),
        event_end_year: parseYear(row['event_end_year']),
        place_text: row['place_text']?.trim() || null,
        latitude: row['latitude']?.trim() ? Number(row['latitude']) : null,
        longitude: row['longitude']?.trim() ? Number(row['longitude']) : null,
        linked_event_ref: row['linked_event_ref']?.trim() || null,
        source_citation: row['source']?.trim() || String(def['provenance_label']),
      }));
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await client
        .from('register_record_events')
        .insert(payload.slice(i, i + 500));
      if (error) {
        console.error('Event insert failed:', error.message);
        process.exit(1);
      }
    }
    console.log(`${key}: ${payload.length} record events seeded.`);
  }
}

void main();
