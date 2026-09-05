import { describe, it, expect } from 'vitest';
import { armCount, runCount, sweepValues, DEFAULT_REPLICATES } from '@/batch/useSweep';
import { SWEEP_COMPARISONS, SWEEP_VARIABLES } from '@/batch/protocol';

/**
 * How a sweep is sized before it runs.
 *
 * These are pure functions on purpose: the cost of a sweep is the thing a
 * reader is deciding about when they turn a comparison on, and it should be
 * knowable without starting one.
 */

describe('sweep sizing', () => {
  it('keeps a comparison close in cost to an uncompared sweep', () => {
    // Turning a comparison on repeats the whole sweep once per arm. If the
    // value grid did not coarsen, comparing three lateral rules would be three
    // times the work; instead the grid trades resolution for the comparison.
    const plain = runCount('mcFraction', 'none', DEFAULT_REPLICATES, true);
    for (const comparison of SWEEP_COMPARISONS) {
      const cost = runCount('mcFraction', comparison, DEFAULT_REPLICATES, true);
      expect(cost).toBeLessThanOrEqual(plain * 1.25);
    }
  });

  it('charges nothing extra for comparing detector stations', () => {
    // A station is a different place to stand while watching the same run, so
    // it costs a filter on the records and not a simulation. It therefore also
    // keeps the fine grid.
    expect(armCount('station', DEFAULT_REPLICATES)).toBe(1);
    expect(sweepValues('mcFraction', 'station', DEFAULT_REPLICATES)).toHaveLength(
      sweepValues('mcFraction', 'none', DEFAULT_REPLICATES).length,
    );
  });

  it('sweeps each variable over its own range, not motorcycle share', () => {
    // The bench used to plot everything against motorcycle share. Sweeping
    // road width over 0 to 0.9 would have put every point on one x.
    const width = sweepValues('width', 'none', DEFAULT_REPLICATES);
    expect(width[0]).toBeGreaterThanOrEqual(3);
    expect(width[width.length - 1]).toBeGreaterThan(5);

    const inflow = sweepValues('inflow', 'none', DEFAULT_REPLICATES);
    expect(inflow[inflow.length - 1]).toBeGreaterThan(1000);

    for (const variable of SWEEP_VARIABLES) {
      const values = sweepValues(variable, 'none', DEFAULT_REPLICATES);
      expect(values.length).toBeGreaterThan(2);
      // Strictly increasing, so the chart can join them in order.
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThan(values[i - 1]);
      }
    }
  });

  it('runs at least two arms for every comparison that has a second arm', () => {
    for (const comparison of ['lateralRule', 'seed', 'rhk'] as const) {
      expect(armCount(comparison, DEFAULT_REPLICATES)).toBeGreaterThanOrEqual(2);
    }
  });
});
