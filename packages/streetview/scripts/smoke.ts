/**
 * Generator smoke test against a local GEDCOM (never committed).
 *
 *   npm run smoke -- "<path-to.ged>" ["Anchor Name"]
 *
 * Defaults to the core fixture tree if no path is given. Prints spec stats
 * and writes nothing — this is a fast sanity loop for generator changes.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractGedcomText, parseGedcom } from '@witness/core/gedcom';
import { generateSceneSpec } from '../src/spec/index.js';

const path =
  process.argv[2] ??
  fileURLToPath(new URL('../../core/fixtures/Howe_Field Family Tree.ged', import.meta.url));
const anchorQuery = process.argv[3]?.toLowerCase();

const t0 = Date.now();
const text = extractGedcomText(new Uint8Array(readFileSync(path)));
const tree = parseGedcom(text, path);
console.log(`parsed ${tree.individuals.size} individuals / ${tree.families.size} families in ${Date.now() - t0}ms`);

// Anchor: named match, else the individual with the deepest ancestor closure.
let anchorId: string | undefined;
if (anchorQuery) {
  for (const [id, ind] of tree.individuals) {
    if (ind.name.full.toLowerCase().includes(anchorQuery)) {
      anchorId = id;
      break;
    }
  }
  if (!anchorId) throw new Error(`No individual matching "${anchorQuery}"`);
} else {
  const memo = new Map<string, number>();
  const countAncestors = (id: string, seen: Set<string>): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const ind = tree.individuals.get(id);
    let n = 0;
    for (const famId of ind?.familyAsChild ?? []) {
      const fam = tree.families.get(famId);
      for (const pid of [fam?.husbandId, fam?.wifeId]) {
        if (pid) n += 1 + countAncestors(pid, seen);
      }
    }
    memo.set(id, n);
    return n;
  };
  let best = -1;
  for (const id of tree.individuals.keys()) {
    const n = countAncestors(id, new Set());
    if (n > best) {
      best = n;
      anchorId = id;
    }
  }
}

const t1 = Date.now();
const spec = generateSceneSpec(tree, { anchorId: anchorId! });
console.log(`anchor: ${spec.anchor.name} (${spec.anchor.individualId})`);
console.log(`spec generated in ${Date.now() - t1}ms`);
console.log(spec.stats);
console.log('major lines:', spec.majorLines.map((l) => `${l.surname}(${l.households})`).join(' '));
const sample = spec.households.filter((h) => h.band === 'documented').slice(0, 3);
for (const h of sample) {
  console.log(
    ` ${h.id} ${h.year} ${h.era} ${h.band} — ${h.husbandName ?? '—'} & ${h.wifeName ?? '—'} @ (${h.x.toFixed(0)}, ${h.z.toFixed(0)})`,
  );
}
const living = spec.households.find((h) => h.band === 'living');
if (living) {
  const leak = living.husbandName || living.wifeName || living.marriageDate || living.place;
  console.log(`living household privacy check: ${leak ? 'FAILED — data leaked!' : 'ok (withheld)'}`);
}
