import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HISTORICAL_EVENTS } from '../events.js';

/**
 * The bundled event list is the offline mirror of the historical_events
 * seed migrations; the two are hand-maintained and silently diverging
 * would make online and offline devices answer differently. This guard
 * can't diff every column out of raw SQL, but it pins the parts that
 * drift first: the slug set and the curation calls this branch made.
 */

function migration(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../../../supabase/migrations/${name}`, import.meta.url)),
    'utf-8',
  );
}

const seedSql = migration('20260707000000_historical_events.sql');
const curationSql = migration('20260709000000_event_curation.sql');

function insertedIds(sql: string): string[] {
  return [...sql.matchAll(/^\s*\('([a-z0-9-]+)',/gm)].map((m) => m[1]!);
}

describe('bundled library ↔ seed migrations', () => {
  it('carries exactly the events the migrations seed', () => {
    const seeded = new Set([...insertedIds(seedSql), ...insertedIds(curationSql)]);
    const bundled = new Set(HISTORICAL_EVENTS.map((event) => event.id));
    expect([...bundled].sort()).toEqual([...seeded].sort());
  });

  it('mirrors the curation migration’s updates', () => {
    // Erie Canal reframed as the construction era.
    expect(curationSql).toContain('start_year = 1817');
    const erie = HISTORICAL_EVENTS.find((event) => event.id === 'erie-canal')!;
    expect(erie.startYear).toBe(1817);
    expect(erie.name).toBe('Construction of the Erie Canal');

    // The Dérangement carries the Acadian lens in both places.
    expect(curationSql).toMatch(/lens_affinity = array\['acadian'\]/);
    const derangement = HISTORICAL_EVENTS.find((event) => event.id === 'grand-derangement')!;
    expect(derangement.lensAffinity).toEqual(['acadian']);

    // Nothing anywhere hands the French and Indian War a lens (its
    // continental geo_scope would pollute derived branch territories).
    expect(curationSql).not.toContain('french_canadian');
    const war = HISTORICAL_EVENTS.find((event) => event.id === 'french-and-indian-war')!;
    expect(war.lensAffinity).toBeUndefined();
  });

  it('keeps tier vocabulary aligned with the check constraint', () => {
    expect(curationSql).toContain("tier in ('major', 'regional', 'local')");
    for (const event of HISTORICAL_EVENTS) {
      expect(['major', 'regional', 'local']).toContain(event.tier);
    }
  });
});
