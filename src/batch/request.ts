import type { Params } from '../sim/types';
import { SCENARIOS } from '../scenarios';
import type { AggregationInterval } from '../estimators';
import type { SweepComparison, SweepRequest, SweepVariable } from './protocol';

/**
 * Observation seconds per swept point, for a given aggregation interval.
 *
 * A regression cannot be run on fewer intervals than it has coefficients, and
 * an interval only exists once a full one has elapsed. So the observation has
 * to grow with the interval: at three minutes a six-minute run gives plenty of
 * samples across eight counting stations, while at sixty minutes a six-minute
 * run gives literally none.
 *
 * This is not a limitation to work around. It is the reason a sixty-minute
 * field regression is so badly determined in the first place, and the sweep
 * makes the user pay the same cost the field engineer paid.
 */
export function measureSecondsFor(interval: number, detectorCount: number): number {
  const wanted = (interval * 10) / Math.max(1, detectorCount);
  return Math.max(360, Math.min(3600, Math.round(wanted)));
}

/** How many runs an arm costs: the observation, plus two if truth is measured. */
const RUNS_PER_ARM = 3;

/** Seeds run when comparing replications, unless the caller says otherwise. */
export const DEFAULT_REPLICATES = 3;

/**
 * The span each variable is swept over.
 *
 * Motorcycle share runs to ninety per cent because that is the app's principal
 * independent variable and the range the literature argues over. The others
 * are bounded by what the scenario can physically be: a road narrower than
 * three metres does not admit a light vehicle at all, and a green shorter than
 * ten seconds discharges nothing.
 */
const SWEEP_RANGE: Record<SweepVariable, { lo: number; hi: number }> = {
  mcFraction: { lo: 0, hi: 0.9 },
  width: { lo: 3, hi: 12 },
  inflow: { lo: 500, hi: 6000 },
  green: { lo: 10, hi: 60 },
};

/**
 * How many arms a comparison costs, so the value grid can be sized against it.
 *
 * Comparing across stations is free — one run, partitioned by detector
 * afterwards — so it keeps the full-resolution grid. Everything else repeats
 * the whole sweep once per arm, and a 19-point sweep across three lateral
 * rules is 171 runs where the uncompared sweep is 57. The grid coarsens
 * instead, trading resolution on the swept axis for the comparison, which is
 * the trade the reader is asking for by turning the comparison on.
 */
export function armCount(comparison: SweepComparison, replicates: number): number {
  switch (comparison) {
    case 'lateralRule':
      return 3;
    case 'seed':
      return Math.max(2, replicates);
    case 'rhk':
      return 2;
    case 'station':
    case 'none':
    default:
      return 1;
  }
}

/**
 * The values to sweep, sized so a comparison costs about what one sweep costs.
 *
 * Fractions land on round percentages at every resolution, because a reader
 * comparing two charts should not have to reconcile 0.0526 with 0.05.
 */
export function sweepValues(
  variable: SweepVariable,
  comparison: SweepComparison,
  replicates: number,
): number[] {
  const arms = armCount(comparison, replicates);
  // Stations are free, so they keep the fine grid.
  const steps = comparison === 'station' || arms === 1 ? 19 : arms >= 3 ? 7 : 10;
  const { lo, hi } = SWEEP_RANGE[variable];
  const stride = (hi - lo) / (steps - 1);
  return Array.from({ length: steps }, (_, i) => Number((lo + i * stride).toFixed(4)));
}

/** Runs a request will perform, for the estimate shown before starting. */
export function runCount(
  variable: SweepVariable,
  comparison: SweepComparison,
  replicates: number,
  includeTruth: boolean,
): number {
  const arms = armCount(comparison, replicates);
  const perArm = includeTruth ? RUNS_PER_ARM : 1;
  return sweepValues(variable, comparison, replicates).length * arms * perArm;
}

/**
 * The request the bench sends, from the reader's current choices.
 *
 * One function, used by the app's Run sweep button and by the bake script
 * that precomputes the chart the bench opens with. If they built their
 * requests separately, the baked chart could quietly describe a different
 * experiment from the one the button runs.
 */
export function benchRequest(options: {
  params: Params;
  seed: number;
  interval: AggregationInterval;
  variable: SweepVariable;
  comparison: SweepComparison;
}): Omit<SweepRequest, 'kind'> {
  const bench = SCENARIOS.bench;
  return {
    scenario: 'bench',
    params: { ...options.params, inflow: 4000 },
    seed: options.seed,
    variable: options.variable,
    comparison: options.comparison,
    replicates: DEFAULT_REPLICATES,
    // Zero to ninety per cent, the app's principal independent variable.
    // Coarser when a comparison is on, so turning one on costs about what
    // one sweep costs rather than three (see sweepValues).
    values: sweepValues(options.variable, options.comparison, DEFAULT_REPLICATES),
    interval: options.interval,
    warmup: 90,
    measure: measureSecondsFor(options.interval, bench.detectors.length),
    // Ground truth costs two further runs per point. It is on, because a
    // bench without the controlled experiment is just four estimates
    // disagreeing with nothing to be wrong about.
    includeTruth: true,
  };
}
