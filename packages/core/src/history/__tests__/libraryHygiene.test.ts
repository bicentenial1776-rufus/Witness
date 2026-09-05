import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { auditPassengers, formatAudit } from '../passengerAudit.js';
import type { PassengerDataset } from '../passengers.js';

/**
 * The committed Crossing Library must never carry a row that is
 * impossible on its face — the matcher refuses such rows silently, and
 * the person who should have been found simply is not (Samuel Eaton,
 * 2026-09-05). Looks are allowed; contradictions are not.
 *
 * The match-records worker bundles its own copy of the library because
 * edge functions cannot read the data directory. The two must be the
 * same bytes, or the app and the CLI answer differently.
 */

const repoRoot = fileURLToPath(new URL('../../../../..', import.meta.url));
const LIBRARY = `${repoRoot}data/immigrant-ships/passengers.json`;
const BUNDLED = `${repoRoot}supabase/functions/match-records/passengers.json`;

describe('the committed Crossing Library', () => {
  it('carries no contradiction', () => {
    const dataset = JSON.parse(readFileSync(LIBRARY, 'utf-8')) as PassengerDataset;
    const contradictions = auditPassengers(dataset).filter((f) => f.tier === 'contradiction');
    expect(contradictions, formatAudit(contradictions)).toEqual([]);
  });

  it('is the same bytes the match-records worker bundles', () => {
    expect(readFileSync(BUNDLED, 'utf-8')).toBe(readFileSync(LIBRARY, 'utf-8'));
  });
});
