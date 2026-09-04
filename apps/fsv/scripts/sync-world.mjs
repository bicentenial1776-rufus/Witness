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
 */
import { existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dest = resolve(here, '..', 'public', 'world');

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

mkdirSync(dest, { recursive: true });
const out = join(dest, 'witness_fsv_demo.html');
copyFileSync(src, out);
const mb = (statSync(out).size / 1048576).toFixed(2);
console.log('sync-world: ' + mb + ' MB  <-  ' + src);

// A second copy for the mobile app's DOM panel. Expo copies everything in
// apps/mobile/public/ into the panel's own folder (www.bundle) at build time,
// so the panel can open the world by a plain relative path. The app must NOT
// require() the file as a Metro asset: for a file outside the app's own
// folder the Release-build resolver produces an address that does not exist
// in the binary (learned on the first iPad run, 2026-09-04). That folder is
// git-ignored at the repository root.
const mobileDest = resolve(here, '..', '..', 'mobile', 'public', 'world');
mkdirSync(mobileDest, { recursive: true });
copyFileSync(src, join(mobileDest, 'witness_fsv_demo.html'));
console.log('sync-world: copied again into ' + mobileDest);
