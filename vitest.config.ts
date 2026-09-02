import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// The engine is headless, so tests run in node with no DOM and no React plugin.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
