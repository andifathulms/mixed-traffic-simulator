import type { DetectorRecord, ObservedClass } from './detector-record';
import { OBSERVED_CLASSES } from './detector-record';

/**
 * Aggregation of detector records into intervals.
 *
 * The interval is passed in, never fixed. It is the control that produced a
 * negative equivalence in the published literature, and sweeping it is a
 * first-class user action (PRD §4.8).
 */

export interface Interval {
  detectorId: string;
  /** Interval start, s. */
  from: number;
  /** Interval length, s. */
  length: number;
  /** Counts by observed class. */
  counts: Record<ObservedClass, number>;
  /** Total vehicles counted. */
  total: number;
  /** Flow scaled to veh/h. */
  flow: number;
  /** Time-mean speed of the crossings, m/s. What a spot detector gives you. */
  timeMeanSpeed: number;
  /**
   * Harmonic mean of the spot speeds, m/s — the standard estimator of
   * space-mean speed from spot measurements. The two differ, and the
   * difference matters because the fundamental relation is defined on the
   * space-mean.
   */
  spaceMeanSpeed: number;
  /** Total detector occupancy in the interval, s. */
  occupiedTime: number;
  /** Occupancy as a fraction of the interval. */
  occupancy: number;
  /** Mean occupancy time by class, s. Null where the class did not appear. */
  meanOccupancyByClass: Record<ObservedClass, number | null>;
}

function emptyCounts(): Record<ObservedClass, number> {
  return { MC: 0, LV: 0, HV: 0, PU: 0 };
}

/**
 * Bucket records into fixed intervals per detector.
 *
 * Partial intervals at the end are dropped. A 55-second tail scaled up to an
 * hourly flow would read as a wild outlier and would contaminate every
 * regression run on the result.
 *
 * `observedUntil` is when observation stopped, which is not the same as the
 * last crossing. Judging completeness by the last crossing biases flow upward:
 * an interval whose final minute happened to be empty gets discarded as
 * incomplete, so exactly the low-flow intervals go missing from the sample.
 * The caller knows how long the detector was running and should say so.
 */
export function aggregate(
  records: readonly DetectorRecord[],
  intervalSeconds: number,
  observedUntil?: number,
): Interval[] {
  if (records.length === 0 || intervalSeconds <= 0) return [];

  const byDetector = new Map<string, DetectorRecord[]>();
  for (const r of records) {
    let list = byDetector.get(r.detectorId);
    if (!list) byDetector.set(r.detectorId, (list = []));
    list.push(r);
  }

  const out: Interval[] = [];

  for (const [detectorId, list] of byDetector) {
    list.sort((a, b) => a.crossingTime - b.crossingTime);
    const end = observedUntil ?? list[list.length - 1].crossingTime;

    for (let from = 0; from + intervalSeconds <= end; from += intervalSeconds) {
      const to = from + intervalSeconds;
      const inBin = list.filter((r) => r.crossingTime >= from && r.crossingTime < to);
      if (inBin.length === 0) {
        // An empty interval is a real observation — zero flow — but it carries
        // no speed and cannot enter a speed regression. It is kept with a
        // zero count so the count-based methods see the zero.
        out.push({
          detectorId,
          from,
          length: intervalSeconds,
          counts: emptyCounts(),
          total: 0,
          flow: 0,
          timeMeanSpeed: 0,
          spaceMeanSpeed: 0,
          occupiedTime: 0,
          occupancy: 0,
          meanOccupancyByClass: { MC: null, LV: null, HV: null, PU: null },
        });
        continue;
      }

      const counts = emptyCounts();
      let speedSum = 0;
      let inverseSpeedSum = 0;
      let occupiedTime = 0;
      const occByClass: Record<ObservedClass, number> = emptyCounts();

      for (const r of inBin) {
        counts[r.vehicleClass]++;
        speedSum += r.spotSpeed;
        inverseSpeedSum += 1 / Math.max(0.1, r.spotSpeed);
        occupiedTime += r.occupancyTime;
        occByClass[r.vehicleClass] += r.occupancyTime;
      }

      const meanOccupancyByClass: Record<ObservedClass, number | null> = {
        MC: null, LV: null, HV: null, PU: null,
      };
      for (const c of OBSERVED_CLASSES) {
        meanOccupancyByClass[c] = counts[c] > 0 ? occByClass[c] / counts[c] : null;
      }

      out.push({
        detectorId,
        from,
        length: intervalSeconds,
        counts,
        total: inBin.length,
        flow: (inBin.length / intervalSeconds) * 3600,
        timeMeanSpeed: speedSum / inBin.length,
        spaceMeanSpeed: inBin.length / inverseSpeedSum,
        occupiedTime,
        occupancy: occupiedTime / intervalSeconds,
        meanOccupancyByClass,
      });
    }
  }

  return out.sort((a, b) => a.from - b.from || a.detectorId.localeCompare(b.detectorId));
}

/** Time headways between successive crossings at one detector, by leader-follower pair. */
export interface HeadwayPair {
  leader: ObservedClass;
  follower: ObservedClass;
  /** Time headway, s. */
  headway: number;
}

/**
 * Successive time headways at each detector.
 *
 * A headway is a property of a pair, so this reports the class of the vehicle
 * in front as well as the one behind — the time headway method needs both.
 */
export function headwayPairs(
  records: readonly DetectorRecord[],
  /** Headways longer than this are treated as free flow, not car following. */
  maxHeadway = 12,
): HeadwayPair[] {
  const byDetector = new Map<string, DetectorRecord[]>();
  for (const r of records) {
    let list = byDetector.get(r.detectorId);
    if (!list) byDetector.set(r.detectorId, (list = []));
    list.push(r);
  }

  const out: HeadwayPair[] = [];
  for (const [, list] of byDetector) {
    list.sort((a, b) => a.crossingTime - b.crossingTime);
    for (let i = 1; i < list.length; i++) {
      const headway = list[i].crossingTime - list[i - 1].crossingTime;
      // A vehicle following at more than maxHeadway is not constrained by the
      // one in front, and including it measures the arrival process rather
      // than the interaction the method is about.
      if (headway <= 0 || headway > maxHeadway) continue;
      out.push({
        leader: list[i - 1].vehicleClass,
        follower: list[i].vehicleClass,
        headway,
      });
    }
  }
  return out;
}
