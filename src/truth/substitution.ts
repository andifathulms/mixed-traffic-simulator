import type { Params, World } from '../sim/types';
import { DT } from '../sim/types';
import { step } from '../sim/world';
import { buildWorld, scenarioParams } from '../scenarios/build';
import type { Scenario } from '../scenarios/types';
import { composition } from '../sim/demand';

/**
 * Ground truth equivalence by controlled substitution.
 *
 * This module MAY import from sim/ — it is the documented exception to the
 * estimator boundary (CLAUDE.md §5), because ground truth is explicitly the
 * thing an observer cannot obtain.
 *
 * In the field you can never know the true equivalence, because you cannot
 * re-run the same hour of traffic with the motorcycles removed. In simulation
 * you can, and that is the entire reason this app exists (PRD §2).
 *
 * The experiment:
 *
 *   1. Run the scenario at its stated composition and measure throughput.
 *   2. Re-run the identical scenario — same seed, same everything — with the
 *      motorcycles replaced by light vehicles, and measure throughput again.
 *   3. The equivalence is the number of cars that occupy the same capacity as
 *      one motorcycle.
 *
 * Both runs are driven to saturation, because equivalence is a statement about
 * capacity. Measuring at free flow would compare two streams that are both
 * getting everything they want, where every vehicle type looks identical and
 * the answer is meaninglessly close to one.
 */

export interface SubstitutionResult {
  /** Motorcycle passenger car equivalent from the controlled experiment. */
  emp: number;
  /** Throughput of the mixed stream, veh/h. */
  mixedThroughput: number;
  /** Throughput of the all-car reference stream, veh/h. */
  referenceThroughput: number;
  /** Motorcycle share actually present in the mixed run. */
  mcFraction: number;
  /** Seconds of simulation discarded before measuring. */
  warmup: number;
  /** Seconds measured. */
  measured: number;
  warnings: string[];
}

export interface SubstitutionOptions {
  /** Seconds to run before measuring, so the corridor is loaded. */
  warmup?: number;
  /** Seconds to measure over. */
  measure?: number;
  /**
   * Inflow used for both runs, veh/h. Set well above capacity so both streams
   * are saturated and throughput measures capacity rather than demand.
   */
  saturationInflow?: number;
}

function throughputOf(
  scenario: Scenario,
  params: Params,
  seed: number,
  warmup: number,
  measure: number,
): { throughput: number; world: World } {
  const world = buildWorld(scenario, params, seed);

  const warmupSteps = Math.round(warmup / DT);
  for (let i = 0; i < warmupSteps; i++) step(world, DT, params);

  const departedAtStart = world.departed;
  const measureSteps = Math.round(measure / DT);
  for (let i = 0; i < measureSteps; i++) step(world, DT, params);

  return {
    throughput: ((world.departed - departedAtStart) / measure) * 3600,
    world,
  };
}

export function substitutionEmp(
  scenario: Scenario,
  baseParams: Params,
  seed: number,
  options: SubstitutionOptions = {},
): SubstitutionResult {
  const warmup = options.warmup ?? 300;
  const measure = options.measure ?? 900;
  const saturationInflow = options.saturationInflow ?? 6000;
  const warnings: string[] = [];

  const shares = composition(baseParams);
  const mcFraction = shares.MC;

  const mixedParams: Params = { ...baseParams, inflow: saturationInflow };

  // The reference stream: the same demand with every motorcycle replaced by a
  // light vehicle. Everything else — seed, geometry, lateral rule, the other
  // types' shares — is held identical, which is what makes this controlled.
  const referenceParams: Params = {
    ...baseParams,
    inflow: saturationInflow,
    mcFraction: 0,
    // Preserving the heavy and public transport shares of the *whole* stream
    // rather than of the remainder, so substituting motorcycles for cars does
    // not quietly change how many buses are present.
    hvShare: shares.HV,
    puShare: shares.PU,
  };

  const mixed = throughputOf(scenario, mixedParams, seed, warmup, measure);
  const reference = throughputOf(scenario, referenceParams, seed, warmup, measure);

  if (mcFraction <= 0) {
    warnings.push(
      'There are no motorcycles in this stream, so substitution has nothing to ' +
        'substitute and the equivalence is undefined.',
    );
    return {
      emp: NaN,
      mixedThroughput: mixed.throughput,
      referenceThroughput: reference.throughput,
      mcFraction,
      warmup,
      measured: measure,
      warnings,
    };
  }

  if (reference.throughput <= 0) {
    warnings.push('The all-car reference stream carried no vehicles, so there is nothing to compare.');
    return {
      emp: NaN,
      mixedThroughput: mixed.throughput,
      referenceThroughput: reference.throughput,
      mcFraction,
      warmup,
      measured: measure,
      warnings,
    };
  }

  // Capacity in passenger car units is fixed by the road. The mixed stream
  // carries Q_mixed vehicles of which a fraction p are motorcycles, so
  //
  //   Q_mixed·(1 − p) + Q_mixed·p·emp = Q_reference
  //
  // and solving for emp gives the number of cars one motorcycle displaces.
  const emp =
    (reference.throughput - mixed.throughput * (1 - mcFraction)) /
    (mixed.throughput * mcFraction);

  if (mixed.world.unserved === 0 || reference.world.unserved === 0) {
    warnings.push(
      'At least one run was not saturated. The entry never turned demand away, so ' +
        'throughput measured demand rather than capacity and the ratio understates ' +
        'the difference between the streams.',
    );
  }

  if (emp < 0) {
    warnings.push(
      'The controlled experiment returned a negative equivalence, which means the ' +
        'mixed stream carried more vehicles than the all-car stream by a margin ' +
        'larger than the motorcycles can account for. Treat this as a sign the run ' +
        'was too short to separate the two.',
    );
  }

  return {
    emp,
    mixedThroughput: mixed.throughput,
    referenceThroughput: reference.throughput,
    mcFraction,
    warmup,
    measured: measure,
    warnings,
  };
}

export { scenarioParams };
