import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

/**
 * Contrast, checked against the token file rather than the rendered page.
 *
 * Six components failed WCAG AA as text, and all six failed through two
 * tokens: --on-dark-faint and --ink-faint. Testing the components would have
 * been testing the symptom six times. The tokens are the thing that has to
 * hold, so the tokens are what this asserts.
 */

const css = readFileSync(
  fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url)),
  'utf8',
);

function token(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --${name} not found`);
  return m[1];
}

function channel(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG 2.2 AA for body-sized text. */
const AA = 4.5;

describe('text tokens meet WCAG AA on every ground they are used on', () => {
  // The dark ground is a scale, so faint text has to clear the *lightest* of
  // them. --surface is the tightest case.
  const darkGrounds = ['void', 'asphalt-edge', 'asphalt', 'surface'];
  const paperGrounds = ['paper-sunken', 'paper'];

  for (const ink of ['on-dark', 'on-dark-mid', 'on-dark-faint']) {
    for (const ground of darkGrounds) {
      it(`--${ink} on --${ground}`, () => {
        expect(contrast(token(ink), token(ground))).toBeGreaterThanOrEqual(AA);
      });
    }
  }

  for (const ink of ['ink', 'ink-mid', 'ink-faint']) {
    for (const ground of paperGrounds) {
      it(`--${ink} on --${ground}`, () => {
        expect(contrast(token(ink), token(ground))).toBeGreaterThanOrEqual(AA);
      });
    }
  }
});

describe('the token scale itself', () => {
  it('keeps body prose at 16 px or larger', () => {
    const m = css.match(/--t-body-size:\s*(\d+(?:\.\d+)?)px/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeGreaterThanOrEqual(16);
  });

  it('never uses the non-text line token for type', () => {
    /*
     * --ink-line is the old --ink-faint, kept for things that were never text:
     * three dashed reference lines and the inspector's term bar. It does not
     * meet AA and is not supposed to. The guard is that nothing paints text
     * with it, because that is how a line colour quietly becomes a text
     * colour again and reopens the bug this all came from.
     */
    const root = fileURLToPath(new URL('../src', import.meta.url));
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (entry.endsWith('.css')) {
          readFileSync(full, 'utf8')
            .split('\n')
            .forEach((line, i) => {
              if (/^\s*(color|fill)\s*:\s*var\(--ink-line\)/.test(line)) {
                offenders.push(`${entry}:${i + 1}`);
              }
            });
        }
      }
    };
    walk(root);

    expect(offenders).toEqual([]);
  });
});
