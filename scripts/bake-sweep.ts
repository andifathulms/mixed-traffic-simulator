/**
 * Precompute the sweep the equivalence bench opens with.
 *
 *   npm run bake
 *
 * The bench is the app's argument, and it used to open on "No sweep yet": a
 * reader had to find it, press Run sweep and wait a minute or more before a
 * single number disagreed with another. This runs the same sweep the button
 * runs — same request builder, same sweep core, same engine — once per
 * aggregation interval, headless, and writes the points with the seed and the
 * full parameter set that produced them (CLAUDE.md §9).
 *
 * Deterministic: the same engine and the same seed give the same file.
 * tests/baked-sweep.test.ts re-runs one point and fails if the committed file
 * no longer matches the engine, so a change to the physics cannot leave a
 * stale chart behind unnoticed. When it fails, run this again.
 *
 * It takes several minutes, most of it the sixty-minute interval, which has to
 * observe for an hour per point before a single aggregation interval exists —
 * the same cost a field engineer paid.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCENARIOS } from '../src/scenarios';
import { scenarioParams } from '../src/scenarios/build';
import { AGGREGATION_INTERVALS } from '../src/estimators';
import { benchRequest } from '../src/batch/request';
import { runSweep } from '../src/batch/sweep-core';
import type { SweepPointResult } from '../src/batch/protocol';
import { BAKED_VARIABLE, BAKED_COMPARISON, type BakedSweep } from '../src/batch/baked';

const bench = SCENARIOS.bench;
const params = scenarioParams(bench, { lateralRule: 'sublane' });
const seed = bench.seed;

const out: BakedSweep = {
  generatedBy: 'scripts/bake-sweep.ts',
  scenario: 'bench',
  seed,
  variable: BAKED_VARIABLE,
  comparison: BAKED_COMPARISON,
  params: benchRequest({
    params,
    seed,
    interval: 300,
    variable: BAKED_VARIABLE,
    comparison: BAKED_COMPARISON,
  }).params,
  intervals: {},
};

for (const interval of AGGREGATION_INTERVALS) {
  const request = benchRequest({
    params,
    seed,
    interval,
    variable: BAKED_VARIABLE,
    comparison: BAKED_COMPARISON,
  });
  const points: SweepPointResult[] = [];
  const started = performance.now();

  await runSweep(
    { kind: 'run', ...request },
    {
      post: (m) => {
        if (m.kind === 'point') points.push(m.point);
        if (m.kind === 'progress') {
          process.stdout.write(`\r${interval / 60} min: ${m.done}/${m.total} points`);
        }
        if (m.kind === 'error') throw new Error(m.message);
      },
      yieldToMessages: () => Promise.resolve(),
      isCancelled: () => false,
    },
  );

  const seconds = ((performance.now() - started) / 1000).toFixed(0);
  process.stdout.write(`\r${interval / 60} min: ${points.length} points in ${seconds} s\n`);
  out.intervals[String(interval)] = { measure: request.measure, warmup: request.warmup, points };
}

/*
 * Six significant places is far below anything the chart or table can show,
 * and it keeps the file to a size worth shipping. The staleness test compares
 * to the same precision.
 */
const json = JSON.stringify(
  out,
  (_key, value: unknown) =>
    typeof value === 'number' && !Number.isInteger(value) ? Number(value.toPrecision(6)) : value,
);

const target = fileURLToPath(new URL('../src/batch/baked-sweep.json', import.meta.url));
writeFileSync(target, json + '\n');
console.log(`Wrote ${target} (${(json.length / 1024).toFixed(1)} KB)`);
