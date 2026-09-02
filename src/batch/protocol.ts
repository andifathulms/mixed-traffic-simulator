import type { Params } from '../sim/types';
import type { ScenarioId } from '../scenarios/types';
import type { EmpEstimate } from '../estimators';

/** What is being swept. Motorcycle fraction is the app's principal variable. */
export type SweepVariable = 'mcFraction' | 'width' | 'inflow' | 'green';

export interface SweepRequest {
  kind: 'run';
  scenario: ScenarioId;
  params: Params;
  seed: number;
  variable: SweepVariable;
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
