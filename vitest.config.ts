import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// The engine is headless, so tests run in node with no DOM and no React plugin.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // The engine is headless, so most tests run in node with no DOM. The
    // interface smoke test opts into jsdom by filename.
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environmentMatchGlobs: [['tests/**/*.dom.test.tsx', 'jsdom']],
    setupFiles: [],
  },
});
