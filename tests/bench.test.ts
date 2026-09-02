import { describe, it, expect } from 'vitest';
import { step } from '@/sim/world';
import { DT } from '@/sim/types';
import { corridor } from '@/scenarios';
import { buildWorld, scenarioParams } from '@/scenarios/build';
import { attachDetectorLog, createDetectorLog } from '@/sim/detectors';
import { allEstimates } from '@/estimators';
import { substitutionEmp } from '@/truth/substitution';
import { MKJI_MC_EMP } from '@/sim/defaults';

/** Run the corridor and keep everything a roadside observer would have. */
function observe(seconds: number, mcFraction: number) {
  const params = scenarioParams(corridor, { mcFraction, inflow: 3600 });
  const world = buildWorld(corridor, params, corridor.seed);
  const log = createDetectorLog();
  attachDetectorLog(log);
  try {
    for (let i = 0; i < Math.round(seconds / DT); i++) step(world, DT, params);
  } finally {
    attachDetectorLog(null);
  }
  return { world, params, records: log.records, until: world.t };
}

describe('the equivalence bench — gate 5', () => {
  const run = observe(3600, 0.6);

  it('collects enough detector records for every method', () => {
    expect(run.records.length).toBeGreaterThan(1000);
  });

  it('produces an estimate from every observational method', () => {
    const est = allEstimates(run.records, 300, run.until);
    for (const e of Object.values(est)) {
      expect(typeof e.value).toBe('number');
      expect(e.sampleCount).toBeGreaterThan(0);
    }
  });

  it('makes the methods disagree with each other', () => {
    // This is the app's thesis (PRD §1): the equivalence factor everyone quotes
    // is an artefact of the method that measured it. If every method agreed,
    // there would be nothing to show.
    const est = allEstimates(run.records, 300, run.until);
    const values = Object.values(est).map((e) => e.value).filter(Number.isFinite);
    expect(values.length).toBeGreaterThanOrEqual(3);
    const spread = Math.max(...values) - Math.min(...values);
    expect(spread).toBeGreaterThan(0.15);
  });

  it('moves the interval-sensitive estimates as the window widens', () => {
    // The aggregation interval is the control that produced a negative
    // equivalence in the published literature (PRD §4.8).
    const short = allEstimates(run.records, 180, run.until);
    const long = allEstimates(run.records, 3600, run.until);
    const moved =
      !Number.isFinite(short.regression.value) ||
      !Number.isFinite(long.regression.value) ||
      Math.abs(short.regression.value - long.regression.value) > 0.02;
    expect(moved).toBe(true);
  });

  it('leaves the headway estimate unchanged by the aggregation interval', () => {
    // It never buckets, so nothing the interval control does can touch it.
    const a = allEstimates(run.records, 180, run.until).headway.value;
    const b = allEstimates(run.records, 3600, run.until).headway.value;
    expect(a).toBeCloseTo(b, 12);
  });

  it('reports rather than clamps a negative estimate', () => {
    const est = allEstimates(run.records, 3600, run.until);
    for (const e of Object.values(est)) {
      if (Number.isFinite(e.value) && e.value < 0) {
        // A negative value must arrive with an explanation, not bare.
        expect(e.warnings.length).toBeGreaterThan(0);
        expect(e.warnings.join(' ')).toMatch(/negative/i);
      }
    }
  });

  it('attaches a specific warning whenever a method cannot be applied', () => {
    const est = allEstimates(run.records.slice(0, 8), 3600, run.until);
    for (const e of Object.values(est)) {
      if (!Number.isFinite(e.value)) expect(e.warnings.length).toBeGreaterThan(0);
    }
  });

  it('re-derives every estimate from the same record without re-simulating', () => {
    // Changing the interval must not require another run — that is what makes
    // it a live control (DESIGN.md §5.6).
    const t0 = Date.now();
    for (const interval of [180, 300, 900, 3600]) {
      allEstimates(run.records, interval, run.until);
    }
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe('ground truth by substitution', () => {
  it('measures a lower equivalence than one, and disagrees with MKJI', () => {
    const params = scenarioParams(corridor, { mcFraction: 0.6 });
    const truth = substitutionEmp(corridor, params, corridor.seed, {
      warmup: 240,
      measure: 600,
    });

    expect(Number.isFinite(truth.emp)).toBe(true);
    // A motorcycle occupies less capacity than a car. If the controlled
    // experiment said otherwise the engine would be wrong, not the literature.
    expect(truth.emp).toBeGreaterThan(0);
    expect(truth.emp).toBeLessThan(1);
    // Whether it matches MKJI's constant is the question, not an assumption.
    expect(truth.emp).not.toBeCloseTo(MKJI_MC_EMP, 3);
  });

  it('carries more vehicles in the mixed stream than in the all-car stream', () => {
    const params = scenarioParams(corridor, { mcFraction: 0.7 });
    const truth = substitutionEmp(corridor, params, corridor.seed, {
      warmup: 240,
      measure: 600,
    });
    expect(truth.mixedThroughput).toBeGreaterThan(truth.referenceThroughput);
  });

  it('is reproducible from the seed alone', () => {
    const params = scenarioParams(corridor, { mcFraction: 0.5 });
    const opts = { warmup: 120, measure: 300 };
    const a = substitutionEmp(corridor, params, 1234, opts);
    const b = substitutionEmp(corridor, params, 1234, opts);
    expect(a.emp).toBe(b.emp);
  });

  it('refuses to report an equivalence when there are no motorcycles', () => {
    const params = scenarioParams(corridor, { mcFraction: 0 });
    const truth = substitutionEmp(corridor, params, corridor.seed, {
      warmup: 60,
      measure: 120,
    });
    expect(Number.isNaN(truth.emp)).toBe(true);
    expect(truth.warnings.join(' ')).toMatch(/no motorcycles/i);
  });
});
