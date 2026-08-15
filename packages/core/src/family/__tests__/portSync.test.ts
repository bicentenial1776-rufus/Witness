import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The relationship engine is hand-mirrored into the Deno edge runtime
 * (supabase/functions/_shared/family/) because edge functions cannot import
 * @witness/core. This test turns the digest.ts-style "keep the two in sync"
 * comment into an enforced invariant: outside the mirror header, the only
 * permitted divergence is import specifiers (.js → .ts, paginate path).
 * Edit the core file, re-run the generator transform (or hand-apply the
 * same change), and this stays green; let them drift and it prints a diff.
 */

const repoRoot = fileURLToPath(new URL('../../../../..', import.meta.url));

const PAIRS: Array<{ core: string; port: string; rewrites: Array<[string, string]> }> = [
  { core: 'packages/core/src/family/graph.ts', port: 'supabase/functions/_shared/family/graph.ts', rewrites: [] },
  {
    core: 'packages/core/src/family/relationship.ts',
    port: 'supabase/functions/_shared/family/relationship.ts',
    rewrites: [["'./graph.ts'", "'./graph.js'"]],
  },
  { core: 'packages/core/src/supabase/paginate.ts', port: 'supabase/functions/_shared/family/paginate.ts', rewrites: [] },
  {
    core: 'packages/core/src/family/precompute.ts',
    port: 'supabase/functions/_shared/family/precompute.ts',
    rewrites: [
      ["'./paginate.ts'", "'../supabase/paginate.js'"],
      ["'./graph.ts'", "'./graph.js'"],
      ["'./relationship.ts'", "'./relationship.js'"],
    ],
  },
];

function stripHeader(text: string): string {
  const lines = text.split('\n');
  while (lines.length && (lines[0]!.startsWith('// Mirrored') || lines[0]!.startsWith('// (portSync'))) {
    lines.shift();
  }
  while (lines.length && lines[0] === '') lines.shift();
  return lines.join('\n');
}

describe('Deno port stays in sync with core', () => {
  for (const { core, port, rewrites } of PAIRS) {
    it(`${port} mirrors ${core}`, () => {
      const corePath = `${repoRoot}${core}`;
      const portPath = `${repoRoot}${port}`;
      expect(
        existsSync(portPath),
        `Missing mirror ${port} — this test needs the full monorepo checkout`,
      ).toBe(true);
      let portText = stripHeader(readFileSync(portPath, 'utf-8'));
      for (const [from, to] of rewrites) portText = portText.split(from).join(to);
      expect(portText).toBe(stripHeader(readFileSync(corePath, 'utf-8')));
    });
  }
});
