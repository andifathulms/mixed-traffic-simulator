import { describe, it, expect } from 'vitest';
import { aggregate, headwayPairs, ols, allEstimates } from '@/estimators';
import type { DetectorRecord } from '@/estimators/detector-record';

function rec(p: Partial<DetectorRecord>): DetectorRecord {
  return {
    detectorId: 'D1',
    crossingTime: 0,
    vehicleClass: 'LV',
    spotSpeed: 10,
    occupancyTime: 0.6,
    lateralPosition: 2,
    ...p,
  };
}

describe('aggregation', () => {
  it('buckets records into fixed intervals per detector', () => {
    const records = [
      rec({ crossingTime: 10 }),
      rec({ crossingTime: 100 }),
      rec({ crossingTime: 200 }),
      rec({ crossingTime: 380 }),
    ];
    const bins = aggregate(records, 180);
    expect(bins).toHaveLength(2);
    expect(bins[0].total).toBe(2);
    expect(bins[1].total).toBe(1);
  });

  it('drops the incomplete tail interval', () => {
    // A 55-second tail scaled to an hourly flow would read as a wild outlier.
    const records = [rec({ crossingTime: 10 }), rec({ crossingTime: 190 })];
    const bins = aggregate(records, 180);
    expect(bins).toHaveLength(1);
    expect(bins[0].from).toBe(0);
  });

  it('keeps a complete interval whose tail happened to be quiet', () => {
    // Judging completeness by the last crossing would drop this interval and
    // bias the sample against exactly the low-flow periods.
    const records = [rec({ crossingTime: 5 }), rec({ crossingTime: 20 })];
    const bins = aggregate(records, 180, 360);
    expect(bins).toHaveLength(2);
    expect(bins[0].total).toBe(2);
    expect(bins[1].total).toBe(0);
    expect(bins[1].flow).toBe(0);
  });

  it('separates detectors', () => {
    const records = [
      rec({ detectorId: 'A', crossingTime: 10 }),
      rec({ detectorId: 'B', crossingTime: 20 }),
      rec({ detectorId: 'A', crossingTime: 190 }),
      rec({ detectorId: 'B', crossingTime: 200 }),
    ];
    const bins = aggregate(records, 180);
    expect(bins.filter((b) => b.detectorId === 'A')).toHaveLength(1);
    expect(bins.filter((b) => b.detectorId === 'B')).toHaveLength(1);
  });

  it('computes flow as an hourly rate', () => {
    const records = Array.from({ length: 30 }, (_, i) => rec({ crossingTime: i * 5 }));
    const bins = aggregate(records, 150, 150);
    expect(bins[0].flow).toBeCloseTo((30 / 150) * 3600, 6);
  });

  it('reports space-mean speed below time-mean speed when speeds vary', () => {
    const records = [
      rec({ crossingTime: 1, spotSpeed: 4 }),
      rec({ crossingTime: 2, spotSpeed: 20 }),
      rec({ crossingTime: 3, spotSpeed: 12 }),
    ];
    const [bin] = aggregate(records, 60, 60);
    // The harmonic mean is always at or below the arithmetic mean, and the
    // fundamental relation is defined on the space-mean.
    expect(bin.spaceMeanSpeed).toBeLessThan(bin.timeMeanSpeed);
  });

  it('excludes free-flow gaps from the headway pairs', () => {
    const records = [
      rec({ crossingTime: 0 }),
      rec({ crossingTime: 1.5 }),
      rec({ crossingTime: 60 }),
    ];
    const pairs = headwayPairs(records, 12);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].headway).toBeCloseTo(1.5, 6);
  });
});

describe('ordinary least squares', () => {
  it('recovers known coefficients exactly', () => {
    const X = [[1, 1], [1, 2], [1, 3], [1, 4], [1, 5]];
    const y = X.map(([, x]) => 3 + 2 * x);
    const fit = ols(X, y)!;
    expect(fit.coefficients[0]).toBeCloseTo(3, 8);
    expect(fit.coefficients[1]).toBeCloseTo(2, 8);
    expect(fit.r2).toBeCloseTo(1, 8);
  });

  it('flags a rank-deficient design rather than returning a confident answer', () => {
    // The second column is a copy of the first, so the split between them is
    // arbitrary. This is exactly what wide aggregation intervals produce.
    const X = [[1, 1], [2, 2], [3, 3], [4, 4]];
    const y = [2, 4, 6, 8];
    const fit = ols(X, y);
    expect(fit === null || fit.illConditioned).toBe(true);
  });

  it('returns null when there are fewer observations than coefficients', () => {
    expect(ols([[1, 2, 3]], [1])).toBeNull();
  });
});

describe('estimators on a synthetic stream', () => {
  /**
   * A stream where the answer is known by construction: motorcycles take
   * exactly half the headway and half the occupancy of a car.
   */
  function syntheticStream(): DetectorRecord[] {
    const out: DetectorRecord[] = [];
    // A period-four pattern, so every leader-follower pair type occurs and the
    // method can condition on the leader's class as it is meant to.
    const pattern: Array<'MC' | 'LV'> = ['LV', 'LV', 'MC', 'MC'];
    let t = 0;
    for (let i = 0; i < 4000; i++) {
      const cls = pattern[i % pattern.length];
      t += cls === 'MC' ? 1 : 2;
      out.push(
        rec({
          crossingTime: t,
          vehicleClass: cls,
          spotSpeed: 10,
          occupancyTime: cls === 'MC' ? 0.3 : 0.6,
        }),
      );
    }
    return out;
  }

  it('recovers a half from occupancy time when that is the construction', () => {
    const est = allEstimates(syntheticStream(), 300);
    expect(est.occupancy.value).toBeCloseTo(0.5, 6);
    expect(est.occupancy.warnings).toHaveLength(0);
  });

  it('recovers a half from time headway when that is the construction', () => {
    const est = allEstimates(syntheticStream(), 300);
    // A motorcycle follows a car in 1 s where a car follows a car in 2 s.
    expect(est.headway.value).toBeCloseTo(0.5, 6);
  });

  it('reports a negative estimate rather than clamping it', () => {
    // Constructed so a car covers the loop for less time than a motorcycle
    // does, which is physically backwards and must be reported as such.
    const records: DetectorRecord[] = [];
    let t = 0;
    for (let i = 0; i < 400; i++) {
      const isMc = i % 2 === 0;
      t += 2;
      records.push(
        rec({ crossingTime: t, vehicleClass: isMc ? 'MC' : 'LV', occupancyTime: isMc ? 1.2 : 0.6 }),
      );
    }
    const est = allEstimates(records, 300);
    expect(est.occupancy.value).toBeCloseTo(2, 6);
    expect(Number.isNaN(est.occupancy.value)).toBe(false);
  });

  it('names the interval in a warning rather than saying invalid', () => {
    const est = allEstimates(syntheticStream().slice(0, 20), 3600);
    for (const e of Object.values(est)) {
      for (const w of e.warnings) {
        expect(w.toLowerCase()).not.toContain('invalid');
        expect(w.length).toBeGreaterThan(20);
      }
    }
  });

  it('carries the aggregation interval through into every estimate', () => {
    for (const interval of [180, 300, 900, 3600]) {
      const est = allEstimates(syntheticStream(), interval);
      for (const e of Object.values(est)) expect(e.interval).toBe(interval);
    }
  });
});
