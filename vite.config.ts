import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Substitute the app's name, descriptor and URL into index.html at build time.
 *
 * They were maintained by hand in the header component and again in three meta
 * tags, with nothing keeping them in step. A share card that has drifted from
 * the page it links to is worse than none: the reader is told one thing and
 * shown another. Both now read src/app-meta.ts.
 *
 * The file is parsed rather than imported so the config stays free of the
 * app's module graph; it is three string constants and the regex is anchored
 * to their exact declarations, so a rename fails the build loudly instead of
 * silently emitting an empty description.
 */
function appMeta(): Plugin {
  const read = (name: string): string => {
    const src = readFileSync(new URL('./src/app-meta.ts', import.meta.url), 'utf8');
    const m = src.match(new RegExp(`export const ${name} =\\s*'([^']*)'`));
    if (!m) throw new Error(`app-meta.ts no longer exports ${name}`);
    return m[1];
  };

  return {
    name: 'app-meta',
    transformIndexHtml(html) {
      return html
        .replace(/%APP_NAME%/g, read('APP_NAME'))
        .replace(/%APP_DESCRIPTOR%/g, read('APP_DESCRIPTOR'))
        .replace(/%APP_URL%/g, read('APP_URL'));
    },
  };
}

// base is the repo path so GitHub Pages serves assets correctly (CLAUDE.md §13).
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/mixed-traffic-simulator/' : '/',
  plugins: [react(), appMeta()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: { target: 'es2022' },
});
