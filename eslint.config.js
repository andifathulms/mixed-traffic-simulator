import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // PRD §7.2 / CLAUDE.md §5 — the estimator boundary, enforced structurally.
  // An estimator that can read vehicle state is not the method a field engineer used.
  {
    files: ['src/estimators/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['**/sim/**', '../sim/*', '@/sim/*', '@/sim', '../sim', '../../sim'],
      }],
    },
  },

  // CLAUDE.md §2 — determinism. No unseeded randomness, no wall clock, anywhere in the engine.
  {
    files: ['src/sim/**', 'src/estimators/**', 'src/truth/**'],
    rules: {
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Use the seeded PRNG from sim/rng.ts. Determinism is a PRD commitment (§7.3).' },
        { object: 'Date', property: 'now', message: 'The engine is headless and deterministic. It cannot read the wall clock.' },
      ],
      'no-restricted-globals': ['error',
        { name: 'window', message: 'The engine is headless (CLAUDE.md §1.4).' },
        { name: 'document', message: 'The engine is headless (CLAUDE.md §1.4).' },
      ],
    },
  },
);
