import type { Params } from '../sim/types';
import type { ScenarioId } from '../scenarios/types';
import type { EmpEstimate } from '../estimators';

/** What is being swept. Motorcycle fraction is the app's principal variable. */
export type SweepVariable = 'mcFraction' | 'width' | 'inflow' | 'green';

/**
 * A second dimension, held against the swept one.
 *
 * The app's thesis is that an equivalence figure is an artefact of how it was
 * measured. The aggregation interval was already exposed because it is the
 * choice that produced a negative emp in the published literature. These are
 * the other choices the app was making silently on the reader's behalf:
 *
 * - `lateralRule`  which of the three lateral models is in force. PRD §7.1
 *                  promises this spread rather than a single number, since the
 *                  rule is a modelling choice and not physics.
 * - `seed`         which realisation of a stochastic process you happened to
 *                  observe. Without it every figure in the bench is n = 1, and
 *                  method disagreement cannot be told apart from sampling.
 * - `station`      which detector you read. Free: one run, partitioned by
 *                  detector, so no extra simulation at all.
 * - `rhk`          whether the advance motorcycle stop box is in place.
 *                  Promised in PRD §4.4.
 */
export type SweepComparison = 'none' | 'lateralRule' | 'seed' | 'station' | 'rhk';

/** The runtime lists, so the URL parser can validate what it is handed. */
export const SWEEP_VARIABLES = ['mcFraction', 'width', 'inflow', 'green'] as const;
export const SWEEP_COMPARISONS = [
  'none',
  'lateralRule',
  'seed',
  'station',
  'rhk',
] as const;

export interface SweepRequest {
  kind: 'run';
  scenario: ScenarioId;
  params: Params;
  seed: number;
  variable: SweepVariable;
  /** The dimension compared against the swept one. */
  comparison: SweepComparison;
  /** How many seeds to run, when comparing across seeds. */
  replicates: number;
  /** Values of the swept variable, in order. */
  values: number[];
  /** Aggregation interval for the observational methods, s. */
  interval: number;
  /** Seconds discarded before measuring, so the corridor is loaded. */
  warmup: number;
  /** Seconds measured at each point. */
  measure: number;
  /** Whether to run the controlled substitution experiment at each point. */
  includeTruth: boolean;
}

export interface SweepCancel {
  kind: 'cancel';
}

export type SweepMessage = SweepRequest | SweepCancel;

export interface SweepPointResult {
  value: number;
  /**
   * Which comparison series this point belongs to. A stable key for grouping,
   * and a label for the reader. Both are 'base' / '' when not comparing.
   */
  seriesKey: string;
  seriesLabel: string;
  mcFraction: number;
  truth: number | null;
  truthWarnings: string[];
  headway: EmpEstimate;
  regression: EmpEstimate;
  speed: EmpEstimate;
  occupancy: EmpEstimate;
  /** Throughput of the run, veh/h. */
  throughput: number;
}

export type SweepResponse =
  | { kind: 'progress'; done: number; total: number }
  | { kind: 'point'; point: SweepPointResult }
  | {
      kind: 'done';
      /** Everything needed to regenerate this chart (CLAUDE.md §9). */
      seed: number;
      params: Params;
      scenario: ScenarioId;
      elapsedMs: number;
    }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };
