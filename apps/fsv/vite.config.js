import { defineConfig } from 'vite';

/**
 * FSV's build. Two rules from the bridge brief hold here:
 *  · three.js lives in this app and nowhere else in the monorepo;
 *  · the build is deterministic — nothing in a generation path may read
 *    Date.now() or Math.random(), so the same file makes the same world.
 *
 * `public/world/` carries the current built monolith from the design repo
 * (GregSHowe/fsv). It is served as-is rather than re-bundled: the world is
 * already one self-contained offline artifact, and re-plumbing it through
 * Vite would buy nothing until the sources graduate module by module.
 */
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020' },
  server: { port: 5183, strictPort: false }
});
