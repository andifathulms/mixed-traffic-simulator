import type { DetectorRecord } from './detector-record';
import { aggregate } from './aggregate';
import type { EmpEstimate } from './types';

/**
 * Occupancy time method.
 *
 * The equivalence is the ratio of the mean time a motorcycle covers the
 * detector to the mean time a light vehicle does. This is the most direct
 * reading of "how much road does this vehicle use", and it is the method that
 * gave 0.32 at a roundabout in the published work.
 *
 * It has a structural bias worth naming. Occupancy time is length divided by
 * speed, so it measures longitudinal footprint only. A motorcycle beside a car
 * rather than behind it covers the loop for its own short length and appears to
 * consume very little road — which is true of the loop and not true of the
 * carriageway. The method cannot see lateral usage because a loop cannot.
 */
export function occupancyEmp(
  records: readonly DetectorRecord[],
  interval: number,
  observedUntil?: number,
): EmpEstimate {
  const intervals = aggregate(records, interval, observedUntil);
  const warnings: string[] = [];

  let mcTime = 0;
  let mcCount = 0;
  let lvTime = 0;
  let lvCount = 0;

  for (const i of intervals) {
    const mc = i.meanOccupancyByClass.MC;
    const lv = i.meanOccupancyByClass.LV;
    if (mc !== null) {
      mcTime += mc * i.counts.MC;
      mcCount += i.counts.MC;
    }
    if (lv !== null) {
      lvTime += lv * i.counts.LV;
      lvCount += i.counts.LV;
    }
  }

  const sampleCount = mcCount + lvCount;

  if (mcCount < 5 || lvCount < 5) {
    warnings.push(
      `Too few crossings to compare — ${mcCount} motorcycles and ${lvCount} light ` +
        'vehicles. Both classes must appear for a ratio to exist.',
    );
    return {
      method: 'Occupancy time',
      value: NaN,
      r2: null,
      sampleCount,
      interval,
      warnings,
    };
  }

  const meanMc = mcTime / mcCount;
  const meanLv = lvTime / lvCount;

  if (meanLv <= 0) {
    warnings.push('Mean light vehicle occupancy is zero — the detector recorded nothing.');
    return {
      method: 'Occupancy time',
      value: NaN,
      r2: null,
      sampleCount,
      interval,
      warnings,
    };
  }

  return {
    method: 'Occupancy time',
    value: meanMc / meanLv,
    r2: null,
    sampleCount,
    interval,
    warnings,
  };
}
