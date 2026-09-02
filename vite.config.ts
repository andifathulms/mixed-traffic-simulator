import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// base is the repo path so GitHub Pages serves assets correctly (CLAUDE.md §13).
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/mixed-traffic-simulator/' : '/',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: { target: 'es2022' },
});
