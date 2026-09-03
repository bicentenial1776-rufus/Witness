/**
 * Copy the built world out of the design repo into public/world/.
 *
 * The artifact is produced by `witness-demo/build/build.ps1` in
 * GregSHowe/fsv and is a single self-contained offline HTML file. It is
 * deliberately NOT committed here: it is ~3 MB and regenerated on every
 * change, so carrying it would grow this repo's history by 3 MB a time for
 * a build that belongs to another repo.
 *
 * Point FSV_DESIGN_REPO at your checkout, or pass the path as an argument.
 *
 * SECOND DESTINATION, added for the W6 spike: apps/mobile/assets/world/.
 * The hidden /field screen carries the world INSIDE the app binary, so the
 * same file has to land where Metro can bundle it. The difference between
 * the two destinations is that the mobile one is TRACKED — a ~1 KB stand-in
 * page is committed there so the app always builds, and this script writes
 * the real 3 MB world over it. That copy must never be committed; the
 * reminder at the end of the run says how to put the stand-in back.
 */
import { existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dests = [
  resolve(here, '..', 'public', 'world'),
  resolve(here, '..', '..', 'mobile', 'assets', 'world')
];

const candidates = [
  process.argv[2],
  process.env.FSV_DESIGN_REPO,
  resolve(here, '..', '..', '..', '..', 'fsv'),
  resolve(process.env.USERPROFILE || process.env.HOME || '.', 'fsv')
].filter(Boolean);

const REL = join('witness-demo', 'dist', 'witness_fsv_demo.html');

let src = null;
for (const c of candidates) {
  const p = join(resolve(c), REL);
  if (existsSync(p)) { src = p; break; }
}

if (!src) {
  console.error('sync-world: could not find the built world.\n' +
    '  Looked for ' + REL + ' under:\n' +
    candidates.map((c) => '    ' + resolve(c)).join('\n') + '\n\n' +
    '  Build it in the design repo first:\n' +
    '    powershell -ExecutionPolicy Bypass -File witness-demo/build/build.ps1\n' +
    '  then re-run, or pass the repo path:\n' +
    '    npm run world:sync -w @witness/fsv -- C:/path/to/fsv');
  process.exit(1);
}

const mb = (statSync(src).size / 1048576).toFixed(2);
for (const dest of dests) {
  mkdirSync(dest, { recursive: true });
  copyFileSync(src, join(dest, 'witness_fsv_demo.html'));
  console.log('sync-world: ' + mb + ' MB  ->  ' + join(dest, 'witness_fsv_demo.html'));
}
console.log('sync-world:              <-  ' + src);
console.log(
  '\n  The copy under apps/mobile is tracked and must not be committed.\n' +
  '  To put the committed stand-in page back before committing:\n' +
  '    git checkout -- apps/mobile/assets/world/witness_fsv_demo.html'
);
