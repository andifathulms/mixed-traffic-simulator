import { useEffect, useState } from 'react';
import type { Params } from '../sim/types';
import type { ScenarioId } from '../scenarios/types';
import type { AggregationInterval } from '../estimators';
import type { SweepComparison, SweepPointResult, SweepVariable } from './protocol';

/**
 * The sweep the bench opens with, precomputed by scripts/bake-sweep.ts.
 *
 * One sweep per aggregation interval, so switching the interval on arrival
 * moves the series the way the argument says it should, with no simulation
 * in the browser. Everything needed to regenerate it — scenario, seed, full
 * parameters, and each interval's observation length — is stored beside the
 * points (CLAUDE.md §9). Running a sweep replaces it.
 */
export const BAKED_VARIABLE: SweepVariable = 'mcFraction';
export const BAKED_COMPARISON: SweepComparison = 'none';

export interface BakedSweep {
  generatedBy: string;
  scenario: ScenarioId;
  seed: number;
  variable: SweepVariable;
  comparison: SweepComparison;
  params: Params;
  /** Keyed by the interval in seconds, as a string for JSON's sake. */
  intervals: Record<string, { measure: number; warmup: number; points: SweepPointResult[] }>;
}

/**
 * The baked sweep, loaded once and lazily.
 *
 * A separate chunk, so the first paint does not wait on a file the reader may
 * never scroll to. Null until it arrives, and it only takes a moment: it ships
 * with the page, there is no network request to anyone else.
 */
export function useBakedSweep(): BakedSweep | null {
  const [baked, setBaked] = useState<BakedSweep | null>(null);
  useEffect(() => {
    let live = true;
    import('./baked-sweep.json')
      .then((m) => {
        if (live) setBaked((m.default ?? m) as unknown as BakedSweep);
      })
      .catch(() => {
        // Without it the bench shows its empty state and the Run button,
        // which is exactly what it did before the file existed.
      });
    return () => {
      live = false;
    };
  }, []);
  return baked;
}

/** The baked points for one interval, or none if the file lacks it. */
export function bakedPoints(
  baked: BakedSweep | null,
  interval: AggregationInterval,
): SweepPointResult[] {
  return baked?.intervals[String(interval)]?.points ?? [];
}
