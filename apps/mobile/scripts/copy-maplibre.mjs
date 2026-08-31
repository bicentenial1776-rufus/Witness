/**
 * Refresh the maplibre worker bundles in public/.
 *
 * Replaces a postinstall that shelled out to
 *
 *   cp <a> <b> public/ 2>/dev/null || true
 *
 * which is fine on a POSIX shell and fails hard on Windows: cmd.exe has no
 * `cp`, cannot parse `2>/dev/null`, and does not know `true`. The install
 * then exits non-zero and the whole monorepo stops — even though both files
 * are committed to public/ already, so this step is a refresh rather than a
 * dependency.
 *
 * Same semantics as before: best effort, never fail the install.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const dist = resolve(app, '..', '..', 'node_modules', 'maplibre-gl', 'dist');
const localDist = resolve(app, 'node_modules', 'maplibre-gl', 'dist');
const dest = join(app, 'public');

const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

try {
  mkdirSync(dest, { recursive: true });
  for (const f of files) {
    const src = [join(dist, f), join(localDist, f)].find(existsSync);
    if (src) copyFileSync(src, join(dest, f));
  }
} catch {
  /* the committed copies stand; never fail an install over a refresh */
}
