import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { SCENARIOS } from '@/scenarios';
import { scenarioParams } from '@/scenarios/build';
import { AGGREGATION_INTERVALS } from '@/estimators';
import { benchRequest, sweepValues, DEFAULT_REPLICATES } from '@/batch/request';
import { runSweep } from '@/batch/sweep-core';
import { BAKED_COMPARISON, BAKED_VARIABLE, type BakedSweep } from '@/batch/baked';
import type { SweepPointResult } from '@/batch/protocol';

/**
 * The precomputed bench is the engine's output, not a picture of it.
 *
 * The bench opens on a sweep baked by scripts/bake-sweep.ts. A chart that
 * silently described an older engine would be the exact failure the app
 * argues against — a number whose provenance nobody can check — so this
 * re-runs one point from the committed seed and parameters and demands the
 * same answer. When the physics changes on purpose, this fails, and the fix
 * is `npm run bake`.
 */

const baked = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/batch/baked-sweep.json', import.meta.url)), 'utf8'),
) as BakedSweep;

const bench = SCENARIOS.bench;

describe('the baked bench sweep', () => {
  it('says what produced it', () => {
    expect(baked.scenario).toBe('bench');
    expect(baked.seed).toBe(bench.seed);
    expect(baked.variable).toBe(BAKED_VARIABLE);
    expect(baked.comparison).toBe(BAKED_COMPARISON);
  });

  it('was run with the request the Run sweep button would send', () => {
    const expected = benchRequest({
      params: scenarioParams(bench, { lateralRule: 'sublane' }),
      seed: bench.seed,
      interval: 300,
      variable: BAKED_VARIABLE,
      comparison: BAKED_COMPARISON,
    });
    // Through JSON, so both sides have lost undefined fields the same way.
    expect(baked.params).toEqual(JSON.parse(JSON.stringify(expected.params)));
  });

  it('covers every aggregation interval with the full grid', () => {
    const grid = sweepValues(BAKED_VARIABLE, BAKED_COMPARISON, DEFAULT_REPLICATES);
    for (const interval of AGGREGATION_INTERVALS) {
      const entry = baked.intervals[String(interval)];
      expect(entry, `interval ${interval}`).toBeTruthy();
      expect(entry.points.map((p) => p.value)).toEqual(grid);
    }
  });

  it('still matches the engine at one point', async () => {
    const interval = 180;
    const request = benchRequest({
      params: scenarioParams(bench, { lateralRule: 'sublane' }),
      seed: bench.seed,
      interval,
      variable: BAKED_VARIABLE,
      comparison: BAKED_COMPARISON,
    });
    // The middle of the grid, where every method has data to work with.
    const stored = baked.intervals[String(interval)].points[9];
    const fresh: SweepPointResult[] = [];

    await runSweep(
      { kind: 'run', ...request, values: [stored.value] },
      {
        post: (m) => {
          if (m.kind === 'point') fresh.push(m.point);
        },
        yieldToMessages: () => Promise.resolve(),
        isCancelled: () => false,
      },
    );

    expect(fresh).toHaveLength(1);
    const now = fresh[0];
    // The file keeps six significant figures; compare to that.
    // JSON has no NaN, so a method that returned no estimate is stored as null.
    const norm = (v: number | null) => (v === null || !Number.isFinite(v) ? null : v);
    const same = (stored: number | null, fresh: number | null) => {
      const a = norm(stored);
      const b = norm(fresh);
      if (a === null || b === null) {
        expect(a).toBe(b);
        return;
      }
      expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * 1e-5 + 1e-9);
    };
    same(stored.truth, now.truth);
    for (const key of ['headway', 'regression', 'speed', 'occupancy'] as const) {
      same(stored[key].value, now[key].value);
    }
  }, 120_000);
});
