import { useCallback, useEffect, useRef, useState } from 'react';
import type { Params } from '../sim/types';
import type { ScenarioId } from '../scenarios/types';
import type {
  SweepComparison,
  SweepVariable,
  SweepPointResult,
  SweepRequest,
  SweepResponse,
} from './protocol';

export interface SweepState {
  points: SweepPointResult[];
  progress: number | null;
  elapsedMs: number | null;
  error: string | null;
  /** Seed and params of the completed sweep, so the chart can be regenerated. */
  provenance: { seed: number; params: Params; scenario: ScenarioId } | null;
}

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

export function useSweep() {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<SweepState>({
    points: [],
    progress: null,
    elapsedMs: null,
    error: null,
    provenance: null,
  });

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const run = useCallback((request: Omit<SweepRequest, 'kind'>) => {
    workerRef.current?.terminate();

    const worker = new Worker(new URL('./sweep.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    setState({ points: [], progress: 0, elapsedMs: null, error: null, provenance: null });

    worker.onmessage = (event: MessageEvent<SweepResponse>) => {
      const message = event.data;
      switch (message.kind) {
        case 'point':
          setState((s) => ({ ...s, points: [...s.points, message.point] }));
          break;
        case 'progress':
          setState((s) => ({ ...s, progress: message.done / message.total }));
          break;
        case 'done':
          setState((s) => ({
            ...s,
            progress: null,
            elapsedMs: message.elapsedMs,
            provenance: {
              seed: message.seed,
              params: message.params,
              scenario: message.scenario,
            },
          }));
          worker.terminate();
          workerRef.current = null;
          break;
        case 'cancelled':
          setState((s) => ({ ...s, progress: null }));
          worker.terminate();
          workerRef.current = null;
          break;
        case 'error':
          setState((s) => ({ ...s, progress: null, error: message.message }));
          worker.terminate();
          workerRef.current = null;
          break;
      }
    };

    worker.postMessage({ kind: 'run', ...request } satisfies SweepRequest);
  }, []);

  const cancel = useCallback(() => {
    workerRef.current?.postMessage({ kind: 'cancel' });
  }, []);

  return { ...state, run, cancel };
}
