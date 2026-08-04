import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5175, host: true },
  // Workspace packages are consumed as TypeScript source (streetview) and
  // built ESM (core); keep them out of the dep pre-bundle so edits hot-reload.
  optimizeDeps: { exclude: ['@witness/streetview', '@witness/core'] },
  build: { target: 'es2021' },
});
