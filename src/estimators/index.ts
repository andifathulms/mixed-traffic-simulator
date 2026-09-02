import type { DetectorRecord } from './detector-record';
import { headwayEmp } from './headway';
import { regressionEmp } from './flow-regression';
import { speedEmp } from './speed';
import { occupancyEmp } from './occupancy';
import type { EmpEstimate, MethodId } from './types';

export type { DetectorRecord, ObservedClass } from './detector-record';
export type { EmpEstimate, MethodId } from './types';
export type { Interval, HeadwayPair } from './aggregate';
export { aggregate, headwayPairs } from './aggregate';
export { ols } from './regression';
export { headwayEmp, regressionEmp, speedEmp, occupancyEmp };

/**
 * Every observational method, applied to the same detector record.
 *
 * Re-deriving all four from an existing record takes milliseconds, which is
 * what lets the aggregation interval be a live control: changing it moves the
 * estimates while ground truth and the MKJI constant stay put, and that
 * contrast is the app's argument (DESIGN.md §5.6).
 */
export function allEstimates(
  records: readonly DetectorRecord[],
  interval: number,
  /** When observation stopped, s. See aggregate() for why this matters. */
  observedUntil?: number,
): Record<Exclude<MethodId, 'truth'>, EmpEstimate> {
  return {
    headway: headwayEmp(records, interval),
    regression: regressionEmp(records, interval, observedUntil),
    speed: speedEmp(records, interval, observedUntil),
    occupancy: occupancyEmp(records, interval, observedUntil),
  };
}

export const AGGREGATION_INTERVALS = [180, 300, 900, 3600] as const;
export type AggregationInterval = (typeof AGGREGATION_INTERVALS)[number];
